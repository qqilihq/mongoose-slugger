import { Schema, SaveOptions, HydratedDocument, Model, mongo } from 'mongoose';
import * as slugger from './slugger';
import limax from 'limax';
import * as semver from 'semver';

// internal utilities which are not meant to belong to the API

export const delegatedSaveFunction = Symbol('_sluggerSaveDelegate');

export const attachmentPropertyName = Symbol('_sluggerAttachment');

export const defaultSlugPath = 'slug';

export function validateOptions(init?: any): asserts init is slugger.SluggerOptions<any> {
  if (!init) {
    throw new Error('options are missing.');
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
  if (
    typeof init.generateFrom !== 'function' &&
    typeof init.generateFrom !== 'string' &&
    !Array.isArray(init.generateFrom)
  ) {
    throw new Error('`generateFrom` must be a string, array, or function.');
  }
}

export class SlugDocumentAttachment {
  slugAttempts: string[] = [];
}

export async function saveSlugWithRetries<D>(
  document: HydratedDocument<D>,
  sluggerOptions: slugger.SluggerOptions<D>,
  saveOptions?: SaveOptions
): Promise<HydratedDocument<D>> {
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
          const slugPath = sluggerOptions.slugPath ?? defaultSlugPath;
          const attemptedSlug = document.get(slugPath) as string;
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

export function createDefaultGenerator(paths: string | string[]): slugger.GeneratorFunction<HydratedDocument<any>> {
  return (doc: HydratedDocument<any>, attempt: number, maxLength?: number) => {
    const values = ([] as string[]).concat(paths).map(path => doc.get(path) as string);
    // replace underscore with hyphen
    const slug = limaxFixed(values.join('-'));
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
export function getSluggerPlugins(schema: Schema<any, any>): any[] {
  return (schema as any).plugins.filter((p: any) => p.fn === slugger.sluggerPlugin);
}

function isMongoError(e: unknown): e is mongo.MongoError {
  if (e == null || typeof e !== 'object') return false;
  if (!('name' in e)) return false;
  if (typeof e.name !== 'string') return false;
  // Mongoose 6+ uses `MongoServerError`: https://mongoosejs.com/docs/migrating_to_6.html#mongoerror-is-now-mongoservererror
  return ['MongoError', 'BulkWriteError', 'MongoServerError'].includes(e.name);
}

export async function checkMongoDB(db: mongo.Db | undefined): Promise<void> {
  if (typeof db === 'undefined') throw new Error('db is undefined');
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
 * * 7.0.12 - OK!
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

export function limaxFixed(input: string): string {
  // https://github.com/lovell/limax/issues/50
  const fixedMapping = {
    ä: 'ae',
    Ä: 'Ae',
    ö: 'oe',
    Ö: 'Oe',
    ü: 'ue',
    Ü: 'Ue'
  };
  let fixedInput = input;
  for (const mapping of Object.entries(fixedMapping)) {
    fixedInput = fixedInput.replaceAll(mapping[0], mapping[1]);
  }
  return limax(fixedInput, { custom: { _: '-' } });
}

// weird way of checking for the proper type,
// instanceof etc. doesn't really work and I
// couldn’t figure out why
export function isModel(model: unknown): model is Model<unknown> {
  return (
    typeof model === 'function' &&
    typeof model.prototype !== 'undefined' &&
    '$isMongooseModelPrototype' in model.prototype &&
    model.prototype.$isMongooseModelPrototype
  );
}
