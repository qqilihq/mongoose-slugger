import { Document, Schema, Model, SaveOptions } from 'mongoose';
import { MongoError } from 'mongodb';
const limax = require('limax');

export interface GeneratorFunction<D extends Document> {
  (doc: D, attempt: number): string;
}

export class SluggerOptions<D extends Document> {
  readonly slugPath: string;
  readonly generator: GeneratorFunction<D>;
  readonly generateFrom?: string | string[];
  readonly index: string;
  // TODO add a `maxAttempts` option? -- when reached, stop trying and throw the error
  constructor (init?: Partial<SluggerOptions<D>>) {
    if (!init) {
      throw new Error('config is missing.');
    }
    if (!init.index) {
      throw new Error('`index` is missing.');
    }

    this.index = init.index;

    // `slug` defaults to 'slug'
    this.slugPath = init.slugPath || 'slug';

    // build generator function from `generateFrom` property
    if (init.generateFrom) {
      this.generator = createDefaultGenerator(init.generateFrom);
    } else if (init.generator) {
      this.generator = init.generator;
    } else {
      // neither `generateFrom` nor `generator` -- error
      throw new Error('`generateFrom` or `generator` is missing.');
    }
  }
}

interface SlugDocumentAttachment {
  slugAttempt: number;
}

const delegatedSaveFunction = '_sluggerSaveDelegate';

export function plugin (schema: Schema, options?: SluggerOptions<any>) {

  if (!options) {
    throw new Error('options are missing.');
  }

  // make sure, that only one slugger instance is used per model (for now)
  const plugins: any[] = (schema as any).plugins.filter((p: any) => p.fn === plugin);
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
    const attempt = (this as any as SlugDocumentAttachment).slugAttempt || 0;
    if (!this.get(options.slugPath) || attempt) {
      this.set(options.slugPath, options.generator(this, attempt));
    }
    next();
  });

}

export function wrap<D extends Document> (model: Model<D>, sluggerOptions: SluggerOptions<D>): Model<D> {

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

      if (e instanceof MongoError) {
        if (e.code === 11000 && extractIndexNameFromError(e.message) === sluggerOptions.index) {
          const slugDocument: SlugDocumentAttachment = document as any;
          slugDocument.slugAttempt = (slugDocument.slugAttempt || 0) + 1;
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
