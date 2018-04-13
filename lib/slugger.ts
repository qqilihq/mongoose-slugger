import { Document, Schema, Model, SaveOptions } from 'mongoose';
import { MongoError } from 'mongodb';
import * as limax from 'limax';

export interface GeneratorFunction<D extends Document> {
  (doc: D, attempt: number): string;
}

export interface SluggerOptions<D extends Document> {
  slugPath?: string;
  generator?: GeneratorFunction<D>;
  generateFrom?: string | string[];
  index: string;
  // TODO add a `maxAttempts` option? -- when reached, stop trying and throw the error
}

interface SlugDocumentAttachment {
  slugAttempt: number;
}

const delegatedSaveFunction = '_sluggerSaveDelegate';

export function plugin (schema: Schema, options?: SluggerOptions<any>) {

  if (!options) {
    throw new Error('options are missing.');
  }

  // `slug` defaults to 'slug'
  const slugPath = options.slugPath || 'slug';

  let generator: GeneratorFunction<Document>;

  // build generator function from `generateFrom` property
  if (options.generateFrom) {
    generator = createDefaultGenerator(options.generateFrom);
  // generator function was given
  } else if (options.generator) {
    generator = options.generator;
  // neither `generateFrom` nor `generator` -- error
  } else {
    throw new Error('`generateFrom` or `generator` is missing.');
  }

  // make sure the specified index exists
  const indices: any[][] = schema.indexes();
  if (!indices.find(entry => entry.length > 1 && entry[1].name === options.index)) {
    throw new Error(`schema contains no index with name '${options.index}'.`);
  }

  schema.pre('validate', function (next) {
    const attempt = (this as any as SlugDocumentAttachment).slugAttempt || 0;
    if (!this.get(slugPath) || attempt) {
      this.set(slugPath, generator(this, attempt));
    }
    next();
  });

}

export function wrap<D extends Document> (model: Model<D>, sluggerOptions: SluggerOptions<D>): Model<D> {

  model.prototype[delegatedSaveFunction] = model.prototype.save;

  model.prototype.save = function (saveOptions, fn): Promise<D> {

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

      const saveFunction = document[delegatedSaveFunction] || document.save;
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
    const values = [].concat(paths).map(path => doc.get(path));
    if (attempt > 0) {
      values.push(attempt + 1);
    }
    return limax(values.join('-'));
  };
}

export function extractIndexNameFromError (message: string): string {
  // https://github.com/matteodelabre/mongoose-beautiful-unique-validation/blob/master/index.js#L5
  const matches = /index: (.+) dup key:/.exec(message);
  return matches ? matches[1] : undefined;
}
