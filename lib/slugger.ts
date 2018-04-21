import { Document, Schema, Model, SaveOptions } from 'mongoose';
const limax = require('limax');

export interface GeneratorFunction<D extends Document> {
  (doc: D, attempt: number): string;
}

export interface SluggerInitOptions<D extends Document> {
  slugPath?: string;
  generateFrom: string | string[] | GeneratorFunction<D>;
  index: string;
}

export class SluggerOptions<D extends Document> {
  readonly slugPath: string;
  readonly generator: GeneratorFunction<D>;
  readonly index: string;
  // TODO add a `maxAttempts` option? -- when reached, stop trying and throw the error
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

    this.index = init.index;

    // `slug` defaults to 'slug'
    this.slugPath = init.slugPath || 'slug';

    // build generator function from `generateFrom` property
    if (typeof init.generateFrom === 'function') {
      this.generator = init.generateFrom;
    } else if (typeof init.generateFrom === 'string' || Array.isArray(init.generateFrom)) {
      this.generator = createDefaultGenerator(init.generateFrom);
    } else {
      throw new Error('`generateFrom` must be a string, array, or function.');
    }
  }
}

class SlugDocumentAttachment {
  slugAttempt: number = 0;
}

const delegatedSaveFunction = '_sluggerSaveDelegate';

const attachmentPropertyName = '_sluggerAttachment';

export function plugin (schema: Schema, options?: SluggerOptions<any>) {

  if (!options) {
    throw new Error('options are missing.');
  }

  // make sure, that only one slugger instance is used per model (for now)
  const plugins = getSluggerPlugins(schema);
  if (plugins.length > 1) {
    throw new Error('slugger was added more than once.');
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

  schema.pre('validate', function (next) {
    let slugAttachment = ((this as any)[attachmentPropertyName] as SlugDocumentAttachment);
    // only generate/retry slugs, when no slug
    // is explicitly given in the document
    if (!slugAttachment && this.get(options.slugPath) == null) {
      slugAttachment = new SlugDocumentAttachment();
      (this as any)[attachmentPropertyName] = slugAttachment;
    }
    if (slugAttachment) {
      this.set(options.slugPath, options.generator(this, slugAttachment.slugAttempt));
    }
    next();
  });

}

export function wrap<D extends Document> (model: Model<D>): Model<D> {

  const plugins = getSluggerPlugins(model.schema);
  if (plugins.length === 0) {
    throw new Error('slugger was not added to this model’s schema.');
  }
  const sluggerOptions = plugins[0].opts;
  if (!(sluggerOptions instanceof SluggerOptions)) {
    throw new Error('attached `opts` are not of type SluggerOptions.');
  }

  model.prototype[delegatedSaveFunction] = model.prototype.save;

  model.prototype.save = function (saveOptions: any, fn: any) {

    if (typeof saveOptions === 'function') {
      fn = saveOptions;
      saveOptions = undefined;
    }

    const promise = saveSlugWithRetries(this, sluggerOptions, saveOptions);

    if (!fn) {
      return promise;
    }

    // nb: don't do then().catch() -- https://stackoverflow.com/a/40642436
    promise.then(result => fn(undefined, result), reason => fn(reason));

  };

  return model;

}

export async function saveSlugWithRetries<D extends Document> (document: D, sluggerOptions: SluggerOptions<D>, saveOptions?: SaveOptions): Promise<D> {

  for (;;) {

    try {

      const saveFunction = (document as any)[delegatedSaveFunction] || document.save;
      return await saveFunction.call(document, saveOptions);

    } catch (e) {

      if (isMongoError(e)) {
        const slugAttachment = ((document as any)[attachmentPropertyName] as SlugDocumentAttachment);
        if (slugAttachment && e.code === 11000 && e.message && extractIndexNameFromError(e.message) === sluggerOptions.index) {
          slugAttachment.slugAttempt++;
          continue;
        }
      }

      throw e;
    }
  }
}

export function createDefaultGenerator (paths: string | string[]): GeneratorFunction<Document> {
  return (doc, attempt) => {
    const values = ([] as string[]).concat(paths).map(path => doc.get(path));
    if (attempt > 0) {
      values.push(attempt + 1);
    }
    return limax(values.join('-'));
  };
}

export function extractIndexNameFromError (msg: string): string | undefined {
  // https://github.com/matteodelabre/mongoose-beautiful-unique-validation/blob/master/index.js#L5
  const matches = /index: (.+) dup key:/.exec(msg);
  return matches ? matches[1] : undefined;
}

/** Gets all Slugger plugins which are assigned to the given schema. */
function getSluggerPlugins (schema: Schema): any[] {
  return (schema as any).plugins.filter((p: any) => p.fn === plugin);
}

function isMongoError (e: any): boolean {
  return ['MongoError', 'BulkWriteError'].indexOf(e.name) !== -1;
}
