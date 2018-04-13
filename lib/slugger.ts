import { Document, Schema, Model, SaveOptions } from 'mongoose';
// tslint:disable-next-line:no-duplicate-imports
import * as mongoose from 'mongoose';
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

  // TODO : make sure the specified index exists
  // const indices = schema.indexes();

  schema.pre('validate', function (next) {
    const attempt = (this as any as SlugDocumentAttachment).slugAttempt || 0;
    if (!this.get(slugPath) || attempt) {
      this.set(slugPath, generator(this, attempt));
    }
    next();
  });

}

export function wrap<D extends Document> (model: Model<D>): Model<D> {

  const index: string = model.prototype.schema.plugins[0].opts.index;

  model.prototype[delegatedSaveFunction] = model.prototype.save;

  model.prototype.save = async function (options, fn) {

    if (typeof options === 'function') {
      fn = options;
      options = undefined;
    }

    let product;
    let error;

    try {
      product = saveSlugWithRetries(this, index, options);
    } catch (e) {
      error = e;
    }

    if (fn) {
      fn.call(this, error, product);
    }
    if (error) {
      throw error;
    }
    return product;
  };

  return model;

}

export async function saveSlugWithRetries<D extends Document> (document: D, index: string, options?: SaveOptions): Promise<D> {

  for (;;) {

    try {

      const saveFunction = document[delegatedSaveFunction] || document.save;
      return await saveFunction.call(document, options);

    } catch (e) {

      if (e instanceof MongoError) {

        if (e.code === 11000 && e.message.includes(index)) {
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
