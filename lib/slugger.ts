import { Document, Schema, Model, SaveOptions } from 'mongoose';
import * as utils from './sluggerUtils';

/**
 * Strategy for generating new slugs.
 */
export interface GeneratorFunction<D extends Document> {
  /**
   * Generates a new slug for the given document. This function
   * is invoked until a unique slug has been found and the document
   * has been saved successfully.
   *
   * @param doc The document.
   * @param attempt Number of attempt, starting with zero.
   * @returns A new slug, such as 'john-doe'.
   */
  (doc: D, attempt: number, maxLength?: number): string;
}

/**
 * Initialization parameters for the SluggerOptions.
 */
export interface SluggerInitOptions<D extends Document> {
  /**
   * The path in the schema where to save the generated slugs.
   * The property given by the path **must** already exist in
   * the schema. In case this is not explicitly given,
   * it defaults to 'slug'.
   */
  slugPath?: string;

  /**
   * The input for generating the slug. This can be either of:
   *
   * (1) a single string or a string array of schema paths -- in
   * this case the slug is generated from the corresponding values,
   * e.g. `[ 'firstname', 'lastname' ]` will result in slugs like
   * 'john-doe'
   *
   * (2) a generator function which gives you full flexibility on
   * how the slug is to be generated.
   */
  generateFrom: string | string[] | GeneratorFunction<D>;

  /**
   * Name of an **existing** index with the `unique` property
   * enabled to ensures slug uniqueness. This means, the index
   * **must** at least contain the `slugPath`.
   *
   * In case you want scoped slugs (unique with regard to another
   * field), this would be a compound index which contains further
   * fields beside the `slugPath`.
   */
  index: string;

  /**
   * The number of attempts to generate a slug before failing.
   * In this case, a `SluggerError` will be thrown.
   *
   * In case the value is not specified, there is **no** limit of
   * attempts, i.e. the slug generating logic will potentially run
   * forever.
   */
  maxAttempts?: number;

  /**
   * Specify a maximum length for the generated slugs.
   *
   * In case the value is not specified, there is **no** limit
   * for slug's length. The value must be greater than zero.
   */
  maxLength?: number;
}

export class SluggerOptions<D extends Document> {
  readonly slugPath: string;
  readonly generator: GeneratorFunction<D>;
  readonly index: string;
  readonly maxAttempts?: number;
  readonly maxLength?: number;
  constructor(init: SluggerInitOptions<D>) {
    if (!init) {
      throw new Error('config is missing.');
    }
    if (!init.index) {
      throw new Error('`index` is missing.');
    }
    if (!init.generateFrom) {
      throw new Error('`generateFrom` is missing.');
    }
    if (typeof init.maxLength === 'number' && init.maxLength < 1) {
      throw new Error('`maxLength` must be at least one.');
    }
    if (typeof init.maxAttempts === 'number' && init.maxAttempts < 1) {
      throw new Error('`maxAttempts` must be at least one.');
    }

    this.index = init.index;

    // `slug` defaults to 'slug'
    this.slugPath = init.slugPath || 'slug';

    // build generator function from `generateFrom` property
    if (typeof init.generateFrom === 'function') {
      this.generator = init.generateFrom;
    } else if (typeof init.generateFrom === 'string' || Array.isArray(init.generateFrom)) {
      this.generator = utils.createDefaultGenerator(init.generateFrom);
    } else {
      throw new Error('`generateFrom` must be a string, array, or function.');
    }

    this.maxAttempts = init.maxAttempts;
    this.maxLength = init.maxLength;
  }
}

export class SluggerError extends Error {
  // nothing here
}

/**
 * The plugin for the Mongoose schema. Use it as follows:
 *
 * ```
 * schema.plugin(slugger.plugin, sluggerOptions);
 * ```
 *
 * **Important:**
 *
 * (1) `sluggerOptions` must be of type `SluggerOptions`,
 *
 * (2) the `slugPath` specified in the SluggerOptions must exist,
 *
 * (3) the `index` specified in the SluggerOptions must exist,
 *
 * (4) after creating the model you **must** wrap the model with
 * the `slugger.wrap` function.
 */
export function plugin(schema: Schema, options?: SluggerOptions<any>): void {
  if (!options) {
    throw new Error('options are missing.');
  }

  // make sure, that only one slugger instance is used per model (for now)
  const plugins = utils.getSluggerPlugins(schema);
  if (plugins.length > 1) {
    throw new Error('slugger was added more than once.');
  }

  // make sure, that the `slugPath` exists
  const schemaType: any = schema.path(options.slugPath);
  if (!schemaType) {
    throw new Error(`the slug path '${options.slugPath}' does not exist in the schema.`);
  }

  // check if there is a `maxLength` constraint for the `slugPath`
  let maxlength = Number.MAX_SAFE_INTEGER;
  if (typeof options.maxLength === 'number') {
    maxlength = options.maxLength;
  } else if (schemaType.options && typeof schemaType.options.maxlength === 'number') {
    maxlength = schemaType.options.maxlength;
  }

  // make sure the specified index exists
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore Yes, this is a 2d array, the types are lying!
  const indices: any[][] = schema.indexes();
  const index = indices.find(entry => entry.length > 1 && entry[1].name === options.index);
  if (!index) {
    throw new Error(`schema contains no index with name '${options.index}'.`);
  }
  if (!index[1].unique) {
    throw new Error(`the index '${options.index}' is not unique.`);
  }
  // make sure, that the `slugPath` is contained in the index
  if (!{}.hasOwnProperty.call(index[0], options.slugPath)) {
    throw new Error(`the index '${options.index}' does not contain the slug path '${options.slugPath}'.`);
  }

  schema.pre('validate', function (this: any, next) {
    let slugAttachment = this[utils.attachmentPropertyName] as utils.SlugDocumentAttachment;
    // only generate/retry slugs, when no slug
    // is explicitly given in the document
    if (!slugAttachment && this.get(options.slugPath) == null) {
      slugAttachment = new utils.SlugDocumentAttachment();
      this[utils.attachmentPropertyName] = slugAttachment;
    }
    if (slugAttachment) {
      this.set(options.slugPath, options.generator(this, slugAttachment.slugAttempts.length, maxlength));
    }
    next();
  });
}

/**
 * Wraps the model, so that the slug-generation logic works.
 *
 * ```
 * let model = mongoose.model('MyData', schema);
 * model = slugger.wrap(model);
 * // model is ready to use now
 * ```
 *
 * @param model The model with the registered slugger plugin.
 */
export function wrap<M extends Model<any>>(model: M): M {
  const plugins = utils.getSluggerPlugins(model.schema);
  if (plugins.length === 0) {
    throw new Error('slugger was not added to this model’s schema.');
  }
  const sluggerOptions = plugins[0].opts;
  if (!(sluggerOptions instanceof SluggerOptions)) {
    throw new Error('attached `opts` are not of type SluggerOptions.');
  }

  model.prototype[utils.delegatedSaveFunction] = model.prototype.save;

  // only check the DB version *once* on first call
  let hasCheckedMongoDB = false;

  model.prototype.save = async function (options?: SaveOptions) {
    if (!hasCheckedMongoDB) {
      await utils.checkMongoDB(model.db.db);
      hasCheckedMongoDB = true;
    }

    return utils.saveSlugWithRetries(this, sluggerOptions, options);
  };

  // Since Mongoose 6 there’s `$save` which is mostly used instead of `save`
  // https://github.com/Automattic/mongoose/commit/0270b515580eaccbc71b6fbf4af2fa8d2ee10471
  model.prototype.$save = model.prototype.save;

  return model;
}
