import { Document, Schema, SaveOptions } from 'mongoose';
import { MongoError } from 'mongodb';
import * as slugger from './slugger';
import limax from 'limax';
import * as mongodb from 'mongodb';

// internal utilities which are not meant to belong to the API

export const delegatedSaveFunction = '_sluggerSaveDelegate';

export const attachmentPropertyName = '_sluggerAttachment';

export class SlugDocumentAttachment {
  slugAttempts: string[] = [];
}

export async function saveSlugWithRetries<D extends Document>(
  document: D,
  sluggerOptions: slugger.SluggerOptions<D>,
  saveOptions?: SaveOptions
): Promise<D> {
  for (;;) {
    try {
      // eslint-disable-next-line @typescript-eslint/unbound-method
      const saveFunction = (document as any)[delegatedSaveFunction] || document.save;
      return await saveFunction.call(document, saveOptions);
    } catch (e) {
      if (isMongoError(e)) {
        const slugAttachment = (document as any)[attachmentPropertyName] as SlugDocumentAttachment;
        if (
          slugAttachment &&
          e.code === 11000 &&
          e.message &&
          extractIndexNameFromError(e.message) === sluggerOptions.index
        ) {
          const attemptedSlug = document.get(sluggerOptions.slugPath);

          if (slugAttachment.slugAttempts.includes(attemptedSlug)) {
            throw new slugger.SluggerError(`Already attempted slug '${attemptedSlug}' before. Giving up.`);
          }

          slugAttachment.slugAttempts.push(attemptedSlug);

          if (sluggerOptions.maxAttempts && slugAttachment.slugAttempts.length >= sluggerOptions.maxAttempts) {
            throw new slugger.SluggerError(
              `Reached ${slugAttachment.slugAttempts.length} attempts without being able to insert. Giving up.`
            );
          }

          continue;
        }
      }

      throw e;
    }
  }
}

export function createDefaultGenerator(paths: string | string[]): slugger.GeneratorFunction<Document> {
  return (doc, attempt) => {
    const values = ([] as string[]).concat(paths).map(path => doc.get(path));
    if (attempt > 0) {
      values.push(attempt + 1);
    }
    return limax(values.join('-'));
  };
}

export function extractIndexNameFromError(msg: string): string | undefined {
  // https://github.com/matteodelabre/mongoose-beautiful-unique-validation/blob/master/index.js#L5
  const matches = /index: (.+) dup key:/.exec(msg);
  return matches ? matches[1] : undefined;
}

/** Gets all Slugger plugins which are assigned to the given schema. */
export function getSluggerPlugins(schema: Schema): any[] {
  return (schema as any).plugins.filter((p: any) => p.fn === slugger.plugin);
}

function isMongoError(e: any): e is MongoError {
  return ['MongoError', 'BulkWriteError'].includes(e.name);
}

export async function checkStorageEngine(db: mongodb.Db): Promise<void> {
  checkStorageEngineStatus(await db.admin().serverStatus());
}

export function checkStorageEngineStatus(status: any) {
  if (!status.storageEngine || !status.storageEngine.name) {
    throw new Error('status.storageEngine is missing');
  }
  if (status.storageEngine.name !== 'wiredTiger') {
    throw new Error(
      `Storage Engine is set to '${status.storageEngine.name}', but only 'wiredTiger' is supported at the moment.`
    );
  }
}
