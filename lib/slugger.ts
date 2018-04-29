import { Document, Schema, Model } from 'mongoose';
import * as utils from './sluggerUtils';

export interface GeneratorFunction<D extends Document> {
  (doc: D, attempt: number): string;
}

export interface SluggerInitOptions<D extends Document> {
  slugPath?: string;
  generateFrom: string | string[] | GeneratorFunction<D>;
  index: string;
  maxAttempts?: number;
}

export class SluggerOptions<D extends Document> {
  readonly slugPath: string;
  readonly generator: GeneratorFunction<D>;
  readonly index: string;
  readonly maxAttempts?: number;
  constructor (init: SluggerInitOptions<D>) {
    if (!init) {
      throw new Error('config is missing.');
    }
    if (!init.index) {
      throw new Error('`index` is missing.');
    }
    if (!init.generateFrom) {
      throw new Error('`generateFrom` is missing.');
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
  }
}

export class SluggerError extends Error {
  // nothing here
}

export function plugin (schema: Schema, options?: SluggerOptions<any>) {

  if (!options) {
    throw new Error('options are missing.');
  }

  // make sure, that only one slugger instance is used per model (for now)
  const plugins = utils.getSluggerPlugins(schema);
  if (plugins.length > 1) {
    throw new Error('slugger was added more than once.');
  }

  // make sure, that the `slugPath` exists
  if (!schema.path(options.slugPath)) {
    throw new Error(`the slug path '${options.slugPath}' does not exist in the schema.`);
  }

  // make sure the specified index exists
  const indices: any[][] = schema.indexes();
  const index = indices.find(entry => entry.length > 1 && entry[1].name === options.index);
  if (!index) {
    throw new Error(`schema contains no index with name '${options.index}'.`);
  }
  if (!index[1].unique) {
    throw new Error(`the index '${options.index}' is not unique.`);
  }
  // make sure, that the `slugPath` in contained in the index
  if (!index[0].hasOwnProperty(options.slugPath)) {
    throw new Error(`the index '${options.index}' does not contain the slug path '${options.slugPath}'.`);
  }

  schema.pre('validate', function (next) {
    let slugAttachment = ((this as any)[utils.attachmentPropertyName] as utils.SlugDocumentAttachment);
    // only generate/retry slugs, when no slug
    // is explicitly given in the document
    if (!slugAttachment && this.get(options.slugPath) == null) {
      slugAttachment = new utils.SlugDocumentAttachment();
      (this as any)[utils.attachmentPropertyName] = slugAttachment;
    }
    if (slugAttachment) {
      this.set(options.slugPath, options.generator(this, slugAttachment.slugAttempts.length));
    }
    next();
  });

}

export function wrap<D extends Document> (model: Model<D>): Model<D> {

  const plugins = utils.getSluggerPlugins(model.schema);
  if (plugins.length === 0) {
    throw new Error('slugger was not added to this model’s schema.');
  }
  const sluggerOptions = plugins[0].opts;
  if (!(sluggerOptions instanceof SluggerOptions)) {
    throw new Error('attached `opts` are not of type SluggerOptions.');
  }

  model.prototype[utils.delegatedSaveFunction] = model.prototype.save;

  model.prototype.save = function (saveOptions: any, fn: any) {

    if (typeof saveOptions === 'function') {
      fn = saveOptions;
      saveOptions = undefined;
    }

    const promise = utils.saveSlugWithRetries(this, sluggerOptions, saveOptions);

    if (!fn) {
      return promise;
    }

    // nb: don't do then().catch() -- https://stackoverflow.com/a/40642436
    promise.then(result => fn(undefined, result), reason => fn(reason));

  };

  return model;

}
