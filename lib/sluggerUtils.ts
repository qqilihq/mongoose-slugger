import { Document, Schema, SaveOptions } from 'mongoose';
import { MongoError } from 'mongodb';
import * as slugger from './slugger';
import limax from 'limax';
import * as mongodb from 'mongodb';
import * as semver from 'semver';

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
          const attemptCount = slugAttachment.slugAttempts.filter(slug => slug === attemptedSlug).length;

          if (attemptCount >= 3) {
            throw new slugger.SluggerError(
              `Already attempted slug '${attemptedSlug}' ${attemptCount} times before. Giving up.`
            );
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
    // replace underscore with hyphen
    const slug = limax(values.join('-'), { custom: { _: '-' } });
    const suffix = attempt > 0 ? `-${attempt + 1}` : '';
    let trimmedSlug = slug;
    if (typeof maxLength === 'number') {
      trimmedSlug = trimmedSlug
        .substring(0, maxLength - suffix.length)
        // prevent that we end up with a double hyphen
        .replace(/-$/, '');
    }
    return trimmedSlug + suffix;
  };
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

function isMongoError(e: unknown): e is MongoError {
  if (e == null || typeof e !== 'object') return false;
  if (!('name' in e)) return false;
  if (typeof e.name !== 'string') return false;
  // Mongoose 6+ uses `MongoServerError`: https://mongoosejs.com/docs/migrating_to_6.html#mongoerror-is-now-mongoservererror
  return ['MongoError', 'BulkWriteError', 'MongoServerError'].includes(e.name);
}

export async function checkMongoDB(db: mongodb.Db): Promise<void> {
  checkMongoDBVersion(await db.admin().serverStatus());
}

/**
 * We require at least MongoDB 4.2.0, because older versions do
 * not deliver consistent messages (across storage engines `wiredTiger`
 * and `ephemeralForTest`) for duplicate key errors on which we depend.
 *
 * We tested the following versions using the test named
 * “correctly propagates error which is caused by duplicate on different index”:
 *
 * * 3.6.23 - inconsistent
 * * 4.0.0 - inconsistent
 * * 4.0.28 - inconsistent
 * * 4.2.0 - OK!
 * * 5.0.16 - OK!
 * * 6.0.5 - OK!
 *
 * @param status The status object which contains a version property.
 */
export function checkMongoDBVersion(status: unknown): void {
  if (status == null || typeof status !== 'object') {
    throw new Error('`status` is null or not an object');
  }
  if (!('version' in status)) {
    throw new Error('`status.version` is missing');
  }
  const version = status.version;
  if (typeof version !== 'string') {
    throw new Error('`status.version` is not a string');
  }
  if (semver.lt(version, '4.2.0')) {
    throw new Error(`At least MongoDB version 4.2.0 is required, actual version is ${version}`);
  }
}
