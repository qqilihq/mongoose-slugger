import { Document, Schema, SaveOptions } from 'mongoose';
import { MongoError } from 'mongodb';
import * as slugger from './slugger';
import limax from 'limax';
import * as mongodb from 'mongodb';

// internal utilities which are not meant to belong to the API

export const delegatedSaveFunction = Symbol('_sluggerSaveDelegate');

export const attachmentPropertyName = Symbol('_sluggerAttachment');

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
      // eslint-disable-next-line @typescript-eslint/unbound-method, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
      const saveFunction = (document as any)[delegatedSaveFunction] || document.save;
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-return
      return await saveFunction.call(document, saveOptions);
    } catch (e) {
      if (isMongoError(e)) {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        const slugAttachment = (document as any)[attachmentPropertyName] as SlugDocumentAttachment;
        if (
          slugAttachment &&
          e.code === 11000 &&
          e.message &&
          extractIndexNameFromError(e.message) === sluggerOptions.index
        ) {
          const attemptedSlug = document.get(sluggerOptions.slugPath) as string;

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
  return (doc: Document, attempt: number, maxLength?: number) => {
    const values = ([] as string[]).concat(paths).map(path => doc.get(path) as string);
    if (attempt > 0) {
      values.push(`${attempt + 1}`);
    }
    // replace underscore with hyphen
    const slug = limax(values.join('-'), { custom: { _: '-' } });
    return maxLength ? trimSlug(slug, maxLength) : slug;
  };
}

export function trimSlug(slug: string, maxLength?: number): string {
  const trimmedSlug = slug.substring(0, maxLength);
  return trimmedSlug.substring(0, Math.min(trimmedSlug.length, trimmedSlug.lastIndexOf('-')));
}

export function extractIndexNameFromError(msg: string): string | undefined {
  // https://github.com/matteodelabre/mongoose-beautiful-unique-validation/blob/master/index.js#L5
  const matches = /index: (.+) dup key:/.exec(msg);
  return matches ? matches[1] : undefined;
}

/** Gets all Slugger plugins which are assigned to the given schema. */
export function getSluggerPlugins(schema: Schema): any[] {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
  return (schema as any).plugins.filter((p: any) => p.fn === slugger.plugin);
}

function isMongoError(e: any): e is MongoError {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
  return typeof e.name === 'string' && ['MongoError', 'BulkWriteError'].includes(e.name);
}

export async function checkStorageEngine(db: mongodb.Db): Promise<void> {
  checkStorageEngineStatus(await db.admin().serverStatus());
}

// eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
export function checkStorageEngineStatus(status: any): void {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
  if (!status.storageEngine || !status.storageEngine.name) {
    throw new Error('status.storageEngine is missing');
  }
  // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
  const name = status.storageEngine.name as string;
  if (name !== 'wiredTiger') {
    throw new Error(`Storage Engine is set to '${name}', but only 'wiredTiger' is supported at the moment.`);
  }
}
