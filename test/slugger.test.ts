import mongoose from 'mongoose';
import * as slugger from '../lib/slugger';
import * as utils from '../lib/sluggerUtils';
import limax from 'limax';
import fs from 'fs';
import path from 'path';
import { MongoError } from 'mongodb';

interface MyDocument extends mongoose.Document {
  firstname: string;
  lastname: string;
  city: string;
  country: string;
  slug: string;
  email: string;
}

describe('slugger', () => {
  let Model: mongoose.Model<MyDocument>;
  let sluggerOptions: slugger.SluggerOptions<MyDocument>;

  beforeAll(() => {
    const schema = new mongoose.Schema({
      firstname: String,
      lastname: String,
      city: String,
      country: String,
      slug: String,
      email: String
    });

    schema.index({ city: 1, country: 1, slug: 1 }, { name: 'city_country_slug', unique: true });
    schema.index({ email: 1 }, { name: 'email', unique: true });

    sluggerOptions = new slugger.SluggerOptions<MyDocument>({
      slugPath: 'slug',

      generateFrom: (doc, attempt) => {
        let result = limax([doc.firstname, doc.lastname].join(' '));
        if (attempt > 0) {
          result += `-${attempt + 1}`;
        }
        return result;
      },

      index: 'city_country_slug',

      maxAttempts: 10
    });

    schema.plugin(slugger.plugin, sluggerOptions);

    Model = mongoose.model<MyDocument>('SlugModel', schema);
    Model = slugger.wrap(Model);
  });

  afterAll(async () => {
    // https://github.com/shelfio/jest-mongodb/issues/214#issuecomment-659535865
    await fs.promises.unlink(process.cwd() + '/globalConfig.json');
  });

  describe('options validation', () => {
    it('throws when creating config with missing object', () => {
      // @ts-expect-error constructor requires argument
      expect(() => new slugger.SluggerOptions()).toThrowError(/config is missing./);
    });

    it('throws error when configuration is missing', () => {
      // @ts-expect-error function requires argument
      expect(() => slugger.plugin()).toThrowError(/options are missing./);
    });

    it('throws error when neither `generateFrom` is given', () => {
      expect(() => new slugger.SluggerOptions({ index: 'slug' } as any)).toThrowError(/`generateFrom` is missing./);
    });

    it('throws error when index is missing', () => {
      // @ts-expect-error `index` argument is missing
      expect(() => new slugger.SluggerOptions({})).toThrowError(/`index` is missing./);
    });

    it('throws error when specified index does not exist', () => {
      const schema = new mongoose.Schema({ name: String, slug: String });
      const sluggerOptions: slugger.SluggerOptions<any> = new slugger.SluggerOptions({
        generateFrom: 'name',
        index: 'does_not_exist'
      });
      expect(() => slugger.plugin(schema, sluggerOptions)).toThrowError(
        /schema contains no index with name 'does_not_exist'./
      );
    });

    it('throws error when applied more than once on a single schema', () => {
      const schema = new mongoose.Schema({ name: String, slug: String });
      schema.index({ slug: 1 }, { name: 'slug', unique: true });
      const sluggerOptions: slugger.SluggerOptions<any> = new slugger.SluggerOptions({
        generateFrom: 'name',
        index: 'slug'
      });
      schema.plugin(slugger.plugin, sluggerOptions);
      expect(() => schema.plugin(slugger.plugin, sluggerOptions)).toThrowError(/slugger was added more than once./);
    });

    it('throws error when index is not unique', () => {
      const schema = new mongoose.Schema({ name: String, slug: String });
      schema.index({ name: 1 }, { name: 'name' });
      const sluggerOptions: slugger.SluggerOptions<any> = new slugger.SluggerOptions({
        generateFrom: 'name',
        index: 'name'
      });
      expect(() => schema.plugin(slugger.plugin, sluggerOptions)).toThrowError(/the index 'name' is not unique./);
    });

    it('throws error when calling `wrap` on a model without plugin', () => {
      const schema = new mongoose.Schema({ name: String });
      const model = mongoose.model('TestModel', schema);
      expect(() => slugger.wrap(model)).toThrowError(/slugger was not added./);
    });

    it('throws error when `maxAttempts` is less than one', () => {
      expect(() => new slugger.SluggerOptions({ generateFrom: 'name', index: 'name', maxAttempts: 0 })).toThrowError(
        /`maxAttempts` must be at least one./
      );
    });

    it('throws error when `maxLength` is less than one', () => {
      expect(() => new slugger.SluggerOptions({ generateFrom: 'name', index: 'name', maxLength: 0 })).toThrowError(
        /`maxLength` must be at least one./
      );
    });

    it('throws error when `slugPath` is missing in the schema', () => {
      const schema = new mongoose.Schema({ name: String });
      const sluggerOptions = new slugger.SluggerOptions({
        generateFrom: 'name',
        index: 'name',
        slugPath: 'does_not_exist'
      });
      expect(() => schema.plugin(slugger.plugin, sluggerOptions)).toThrowError(
        /the slug path 'does_not_exist' does not exist in the schema./
      );
    });

    it('throws error when `index` does not contain `slugPath`', () => {
      const schema = new mongoose.Schema({ name: String, slug: String });
      schema.index({ name: 1 }, { name: 'name_index', unique: true });
      const sluggerOptions = new slugger.SluggerOptions({
        generateFrom: 'name',
        index: 'name_index',
        slugPath: 'slug'
      });
      expect(() => schema.plugin(slugger.plugin, sluggerOptions)).toThrowError(
        /the index 'name_index' does not contain the slug path 'slug'./
      );
    });
  });

  describe('default generator', () => {
    let doc: MyDocument;

    beforeEach(() => {
      doc = new Model({ firstname: 'john', lastname: 'doe' });
    });

    describe('single property', () => {
      const generator = utils.createDefaultGenerator('firstname');

      it('generates slug for sequence 0', () => {
        expect(generator(doc, 0)).toEqual('john');
      });

      it('generates slug for sequence 1', () => {
        expect(generator(doc, 1)).toEqual('john-2');
      });
    });

    describe('multiple properties', () => {
      const generator = utils.createDefaultGenerator(['firstname', 'lastname']);

      it('generates slug', () => {
        expect(generator(doc, 1)).toEqual('john-doe-2');
      });

      it('ignores missing values', () => {
        expect(generator(new Model({ firstname: 'john' }), 1)).toEqual('john-2');
      });
    });

    describe('with `maxlength`', () => {
      const generator = utils.createDefaultGenerator(['firstname', 'lastname']);

      beforeEach(() => {
        doc = new Model({ firstname: 'Salvador Felipe Jacinto Dalí y', lastname: 'Domenech' });
      });

      it('generates uncut slug', () => {
        expect(generator(doc, 0)).toEqual('salvador-felipe-jacinto-dali-y-domenech');
      });

      it('trims slug to given `maxLength` with sequence 0', () => {
        expect(generator(doc, 0, 25)).toEqual('salvador-felipe-jacinto-d');
      });

      it('trims slug to given `maxLength` with sequence 1', () => {
        expect(generator(doc, 1, 25)).toEqual('salvador-felipe-jacinto-2');
      });
    });

    describe('allowed characters', () => {
      it('replaces underscore with hyphen', () => {
        const doc = new Model({ firstname: 'john_bob' });
        const generator = utils.createDefaultGenerator('firstname');
        expect(generator(doc, 0)).toEqual('john-bob');
      });
    });
  });

  describe('validation', () => {
    it('generates slug on validate', async () => {
      const doc = new Model({ firstname: 'john', lastname: 'doe' });
      await doc.validate();
      expect(doc.slug).toEqual('john-doe');
    });
  });

  describe('saving to database', function () {
    jest.setTimeout(10 * 1000);
    // this.slow(1000);

    // mongoose.set('debug', true);

    beforeAll(() =>
      mongoose.connect(process.env.MONGO_URL as string, {
        connectTimeoutMS: 30 * 1000 /* 30 seconds */,
        useNewUrlParser: true,
        useCreateIndex: true,
        useUnifiedTopology: true
      })
    );
    beforeEach(() =>
      Promise.all(mongoose.modelNames().map(modelName => mongoose.model(modelName).deleteMany({}).exec()))
    );
    afterAll(() => mongoose.connection.close());

    describe('using helper function', () => {
      it('generates another slug in case of a conflict', async () => {
        await Model.create({
          firstname: 'john',
          lastname: 'doe',
          city: 'memphis',
          country: 'usa',
          email: 'john@example.com'
        } as any);
        const doc2 = await utils.saveSlugWithRetries(
          new Model({
            firstname: 'john',
            lastname: 'doe',
            city: 'memphis',
            country: 'usa',
            email: 'john2@example.com'
          }),
          sluggerOptions
        );
        expect(doc2.slug).toEqual('john-doe-2');
      });

      it('generates slug sequence', async () => {
        await Model.create({
          firstname: 'john',
          lastname: 'doe',
          city: 'memphis',
          country: 'usa',
          email: 'john@example.com'
        } as any); // slug = john-doe
        for (let n = 2; n <= 10; n++) {
          const doc = await utils.saveSlugWithRetries(
            new Model({
              firstname: 'john',
              lastname: 'doe',
              city: 'memphis',
              country: 'usa',
              email: `john${n}@example.com`
            }),
            sluggerOptions
          );
          expect(doc.slug).toEqual(`john-doe-${n}`);
        }
      });

      it('throws when `maxAttempts` has been exceeded', async () => {
        for (let n = 0; n < 10; n++) {
          await utils.saveSlugWithRetries(
            new Model({
              firstname: 'john',
              lastname: 'doe',
              city: 'memphis',
              country: 'usa',
              email: `john${n}@example.com`
            }),
            sluggerOptions
          );
        }
        try {
          await expect(
            async () =>
              await utils.saveSlugWithRetries(
                new Model({
                  firstname: 'john',
                  lastname: 'doe',
                  city: 'memphis',
                  country: 'usa',
                  email: `john@example.com`
                }),
                sluggerOptions
              )
          ).rejects.toThrow();
        } catch (e) {
          expect(e).toBeInstanceOf(slugger.SluggerError);
          expect((e as slugger.SluggerError).message).toEqual(
            'Reached 10 attempts without being able to insert. Giving up.'
          );
        }
      });
    });

    describe('promises', () => {
      it('generates slug', async () => {
        const doc = await Model.create({ firstname: 'john', lastname: 'doe', city: 'memphis', country: 'usa' } as any);
        expect(doc.slug).toEqual('john-doe');
      });

      it('generates another slug in case of a conflict', async () => {
        await Model.create({
          firstname: 'john',
          lastname: 'doe',
          city: 'memphis',
          country: 'usa',
          email: 'john@example.com'
        } as any);
        const doc2 = await Model.create({
          firstname: 'john',
          lastname: 'doe',
          city: 'memphis',
          country: 'usa',
          email: 'john2@example.com'
        } as any);
        expect(doc2.slug).toEqual('john-doe-2');
      });

      it('generates no slug when explicity specified', async () => {
        const doc = await Model.create({
          firstname: 'john',
          lastname: 'doe',
          city: 'memphis',
          country: 'usa',
          slug: 'john'
        } as any);
        expect(doc.slug).toEqual('john');
      });

      it('does not retry when explicitly specified and conflicts', async () => {
        await Model.create({
          firstname: 'john',
          lastname: 'doe',
          city: 'memphis',
          country: 'usa',
          email: 'john.doe@example.com',
          slug: 'john'
        });
        try {
          await expect(
            async () =>
              await Model.create({
                firstname: 'john',
                lastname: 'dope',
                city: 'memphis',
                country: 'usa',
                email: 'john.dope@example.com',
                slug: 'john'
              })
          ).rejects.toThrow();
        } catch (e) {
          expect(e).toBeInstanceOf(Object);
          expect((e as MongoError).code).toEqual(11000);
        }
      });

      it('correctly propagates error which is caused by duplicate on different index', async () => {
        await Model.create({ firstname: 'john', lastname: 'doe', email: 'john@example.com' } as any);
        try {
          await expect(
            async () => await Model.create({ firstname: 'john', lastname: 'dope', email: 'john@example.com' } as any)
          ).rejects.toThrow();
        } catch (e) {
          expect(e).toBeInstanceOf(Object);
          expect((e as MongoError).code).toEqual(11000);
        }
      });

      it.todo('correctly propagates error which is not caused by duplicate keys');
    });

    describe('callbacks', () => {
      it('does not return promises when using callbacks', done => {
        const result = new Model({}).save(err => void done(err));
        expect(result).toBeUndefined();
      });

      it('generates slug', done => {
        void new Model({ firstname: 'john', lastname: 'doe', city: 'memphis', country: 'usa' } as any).save(
          (err, product) => {
            expect(err).toBeUndefined();
            expect(product).toBeInstanceOf(Object);
            done();
          }
        );
      });

      it('generates another slug in case of a conflict', done => {
        void new Model({
          firstname: 'john',
          lastname: 'doe',
          city: 'memphis',
          country: 'usa',
          email: 'john@example.com'
        } as any).save(err => {
          if (err) {
            done(err);
            return;
          }
          void new Model({
            firstname: 'john',
            lastname: 'doe',
            city: 'memphis',
            country: 'usa',
            email: 'john2@example.com'
          }).save((err, product) => {
            if (err) {
              done(err);
              return;
            }
            expect(err).toBeUndefined();
            expect(product.slug).toEqual('john-doe-2');
            done();
          });
        });
      });

      it('propagates error which is caused by duplicate on different index', done => {
        void new Model({ firstname: 'john', lastname: 'doe', email: 'john@example.com' } as any).save(err => {
          if (err) {
            done(err);
            return;
          }
          void new Model({ firstname: 'john', lastname: 'dope', email: 'john@example.com' } as any).save(err => {
            expect(err).toBeInstanceOf(Object);
            expect((err as MongoError).code).toEqual(11000);
            done();
          });
        });
      });
    });

    describe('generating duplicate slugs within one sequence', () => {
      let Model2: mongoose.Model<MyDocument>;
      let sluggerOptions2: slugger.SluggerOptions<MyDocument>;

      beforeAll(async () => {
        const schema2 = new mongoose.Schema({
          firstname: String,
          slug: String
        });

        schema2.index({ slug: 1 }, { name: 'slug', unique: true });

        sluggerOptions2 = new slugger.SluggerOptions<MyDocument>({
          slugPath: 'slug',
          generateFrom: doc => doc.firstname,
          index: 'slug'
        });

        schema2.plugin(slugger.plugin, sluggerOptions2);

        Model2 = mongoose.model<MyDocument>('SlugModel2', schema2);
        Model2 = slugger.wrap(Model2);
        await Model2.ensureIndexes();
      });

      it('throws when same slugs are generated within one save cycle', async () => {
        await Model2.create({ firstname: 'john' } as any);
        try {
          await expect(async () => await Model2.create({ firstname: 'john' } as any)).rejects.toThrow();
        } catch (e) {
          expect(e).toBeInstanceOf(slugger.SluggerError);
          expect((e as slugger.SluggerError).message).toEqual("Already attempted slug 'john' before. Giving up.");
        }
      });
    });

    describe('generating slugs with `maxlength` on schema', () => {
      let Model3: mongoose.Model<MyDocument>;
      let sluggerOptions3: slugger.SluggerOptions<MyDocument>;

      beforeAll(async () => {
        const schema3 = new mongoose.Schema({
          firstname: String,
          slug: { type: String, maxlength: 25 }
        });

        schema3.index({ slug: 1 }, { name: 'slug', unique: true });

        sluggerOptions3 = new slugger.SluggerOptions<MyDocument>({
          slugPath: 'slug',
          generateFrom: 'firstname',
          index: 'slug'
        });

        schema3.plugin(slugger.plugin, sluggerOptions3);

        Model3 = mongoose.model<MyDocument>('SlugModel3', schema3);
        Model3 = slugger.wrap(Model3);
        await Model3.ensureIndexes();
      });

      it('shortens slugs to `maxlength`', async () => {
        const doc = await Model3.create({
          firstname: 'Salvador Felipe Jacinto Dalí y',
          lastname: 'Domenech'
        } as any);
        expect(doc.slug).toHaveLength(25);
        expect(doc.slug).toEqual('salvador-felipe-jacinto-d');
      });
    });

    describe('generate slugs with `maxLength` on options', () => {
      let Model4: mongoose.Model<MyDocument>;

      beforeAll(async () => {
        const schema4 = new mongoose.Schema({
          firstname: String,
          slug: { type: String, maxlength: 50 }
        });

        schema4.index({ slug: 1 }, { name: 'slug', unique: true });

        const sluggerOptions4 = new slugger.SluggerOptions<MyDocument>({
          slugPath: 'slug',
          generateFrom: 'firstname',
          index: 'slug',
          maxLength: 25
        });

        schema4.plugin(slugger.plugin, sluggerOptions4);

        Model4 = mongoose.model<MyDocument>('SlugModel4', schema4);
        Model4 = slugger.wrap(Model4);
        await Model4.ensureIndexes();
      });

      it('shortens slugs to `maxlength`', async () => {
        const doc = await Model4.create({
          firstname: 'Salvador Felipe Jacinto Dalí y',
          lastname: 'Domenech'
        } as any);
        expect(doc.slug).toHaveLength(25);
        expect(doc.slug).toEqual('salvador-felipe-jacinto-d');
      });
    });
  });

  describe('utilities', () => {
    it('extracts index name from error message', () => {
      const message =
        'E11000 duplicate key error collection: slugger-test.slugmodels index: city_country_slug dup key: { : "memphis", : "usa", : "john-doe" }';
      expect(utils.extractIndexNameFromError(message)).toEqual('city_country_slug');
    });

    it('returns `undefined` in case of no match', () => {
      expect(utils.extractIndexNameFromError('foo')).toBeUndefined();
    });

    describe('checking storage engine', () => {
      it('throws error with `ephemeralForTest`', async () => {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        const status = await readJson(path.join(__dirname, '__data/status_ephemeralForTest.json'));
        expect(() => utils.checkStorageEngineStatus(status)).toThrowError(
          "Storage Engine is set to 'ephemeralForTest', but only 'wiredTiger' is supported at the moment."
        );
      });
      it('throws no error with `wiredTiger`', async () => {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        const status = await readJson(path.join(__dirname, '__data/status_wiredTiger.json'));
        expect(() => utils.checkStorageEngineStatus(status)).not.toThrowError();
      });
    });

    it('limax character mapping', () => {
      const unmappedCharacters: string[] = [];
      for (let idx = 0; idx < 65535; idx++) {
        const char = String.fromCharCode(idx);
        const slugged = limax(char);
        if (char === slugged) {
          unmappedCharacters.push(char);
        }
      }
      expect(unmappedCharacters.join('')).toEqual('0123456789_abcdefghijklmnopqrstuvwxyz');
    });
  });
});

async function readJson(path: string): Promise<any> {
  const jsonString = await fs.promises.readFile(path, 'utf8');
  // eslint-disable-next-line @typescript-eslint/no-unsafe-return
  return JSON.parse(jsonString);
}
