import mongoose, { Schema } from 'mongoose';
import { SluggerError, SluggerOptions, sluggerPlugin } from '../lib/slugger';
import * as utils from '../lib/sluggerUtils';
import limax from 'limax';
import fs from 'fs';

interface MyDocument {
  firstname: string;
  lastname: string;
  city: string;
  country: string;
  slug: string;
  email: string;
}

describe('slugger', () => {
  mongoose.set('strictQuery', false);

  let schema: Schema<MyDocument>;
  let Model: mongoose.Model<MyDocument>;
  let sluggerOptions: SluggerOptions<MyDocument>;

  beforeAll(() => {
    schema = new mongoose.Schema<MyDocument>({
      firstname: String,
      lastname: String,
      city: String,
      country: String,
      slug: String,
      email: String
    });

    schema.index({ city: 1, country: 1, slug: 1 }, { name: 'city_country_slug', unique: true });
    schema.index({ email: 1 }, { name: 'email', unique: true });

    sluggerOptions = {
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
    };

    schema.plugin(sluggerPlugin, sluggerOptions);

    Model = mongoose.model<MyDocument>('SlugModel', schema);
  });

  afterAll(async () => {
    // https://github.com/shelfio/jest-mongodb/issues/214#issuecomment-659535865
    await fs.promises.unlink(process.cwd() + '/globalConfig.json');
  });

  describe('options validation', () => {
    it('throws when creating config with missing object', () => {
      // @ts-expect-error constructor requires argument
      expect(() => new utils.validateOptions()).toThrow(/options are missing./);
    });

    it('throws error when configuration is missing', () => {
      expect(() => utils.validateOptions()).toThrow(/options are missing./);
    });

    it('throws error when neither `generateFrom` is given', () => {
      // @ts-expect-error argument missing
      expect(() => new utils.validateOptions({ index: 'slug' })).toThrow(/`generateFrom` is missing./);
    });

    it('throws error when index is missing', () => {
      // @ts-expect-error `index` argument is missing
      expect(() => new utils.validateOptions({})).toThrow(/`index` is missing./);
    });

    it('throws error when specified index does not exist', () => {
      const schema = new mongoose.Schema({ name: String, slug: String });
      const sluggerOptions: SluggerOptions<any> = {
        generateFrom: 'name',
        index: 'does_not_exist'
      };
      expect(() => sluggerPlugin(schema, sluggerOptions)).toThrow(
        /schema contains no index with name 'does_not_exist'./
      );
    });

    it('throws error when applied more than once on a single schema', () => {
      const schema = new mongoose.Schema({ name: String, slug: String });
      schema.index({ slug: 1 }, { name: 'slug', unique: true });
      const sluggerOptions: SluggerOptions<any> = {
        generateFrom: 'name',
        index: 'slug'
      };
      schema.plugin(sluggerPlugin, sluggerOptions);
      expect(() => schema.plugin(sluggerPlugin, sluggerOptions)).toThrow(/slugger was added more than once./);
    });

    it('throws error when index is not unique', () => {
      const schema = new mongoose.Schema({ name: String, slug: String });
      schema.index({ name: 1 }, { name: 'name' });
      const sluggerOptions: SluggerOptions<any> = {
        generateFrom: 'name',
        index: 'name'
      };
      expect(() => schema.plugin(sluggerPlugin, sluggerOptions)).toThrow(/the index 'name' is not unique./);
    });

    it('throws error when `maxAttempts` is less than one', () => {
      expect(() => utils.validateOptions({ generateFrom: 'name', index: 'name', maxAttempts: 0 })).toThrow(
        /`maxAttempts` must be at least one./
      );
    });

    it('throws error when `generateFrom` is invalid type', () => {
      expect(() => utils.validateOptions({ generateFrom: 1, index: 'name' })).toThrow(
        /`generateFrom` must be a string, array, or function./
      );
    });

    it('throws error when `maxLength` is less than one', () => {
      expect(() => utils.validateOptions({ generateFrom: 'name', index: 'name', maxLength: 0 })).toThrow(
        /`maxLength` must be at least one./
      );
    });

    it('throws error when `slugPath` is missing in the schema', () => {
      const schema = new mongoose.Schema({ name: String });
      const sluggerOptions: SluggerOptions<any> = {
        generateFrom: 'name',
        index: 'name',
        slugPath: 'does_not_exist'
      };
      expect(() => schema.plugin(sluggerPlugin, sluggerOptions)).toThrow(
        /the slug path 'does_not_exist' does not exist in the schema./
      );
    });

    it('throws error when `index` does not contain `slugPath`', () => {
      const schema = new mongoose.Schema({ name: String, slug: String });
      schema.index({ name: 1 }, { name: 'name_index', unique: true });
      const sluggerOptions: SluggerOptions<any> = {
        generateFrom: 'name',
        index: 'name_index',
        slugPath: 'slug'
      };
      expect(() => schema.plugin(sluggerPlugin, sluggerOptions)).toThrow(
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

      it('trims slug to given `maxLength` and prevents double hyphens', () => {
        expect(generator(doc, 1, 18)).toEqual('salvador-felipe-2');
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

    beforeAll(async () => {
      await mongoose.connect(process.env.MONGO_URL as string, {
        connectTimeoutMS: 30 * 1000 /* 30 seconds */
      });
      await Model.ensureIndexes();
    });

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
        });
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
        }); // slug = john-doe
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
        await expect(() =>
          utils.saveSlugWithRetries(
            new Model({
              firstname: 'john',
              lastname: 'doe',
              city: 'memphis',
              country: 'usa',
              email: `john@example.com`
            }),
            sluggerOptions
          )
        ).rejects.toThrow('Reached 10 attempts without being able to insert. Giving up.');
      });
    });

    describe('promises using `Model.create`', () => {
      it('generates slug', async () => {
        const doc = await Model.create({ firstname: 'john', lastname: 'doe', city: 'memphis', country: 'usa' });
        expect(doc.slug).toEqual('john-doe');
      });

      it('generates another slug in case of a conflict', async () => {
        await Model.create({
          firstname: 'john',
          lastname: 'doe',
          city: 'memphis',
          country: 'usa',
          email: 'john@example.com'
        });
        const doc2 = await Model.create({
          firstname: 'john',
          lastname: 'doe',
          city: 'memphis',
          country: 'usa',
          email: 'john2@example.com'
        });
        expect(doc2.slug).toEqual('john-doe-2');
      });

      it('generates no slug when explicity specified', async () => {
        const doc = await Model.create({
          firstname: 'john',
          lastname: 'doe',
          city: 'memphis',
          country: 'usa',
          slug: 'john'
        });
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
        await expect(() =>
          Model.create({
            firstname: 'john',
            lastname: 'dope',
            city: 'memphis',
            country: 'usa',
            email: 'john.dope@example.com',
            slug: 'john'
          })
        ).rejects.toThrow(
          'E11000 duplicate key error collection: test.slugmodels index: city_country_slug dup key: { city: "memphis", country: "usa", slug: "john" }'
        );
      });

      it('correctly propagates error which is caused by duplicate on different index', async () => {
        await Model.create({ firstname: 'john', lastname: 'doe', email: 'john@example.com' });
        await expect(Model.create({ firstname: 'john', lastname: 'dope', email: 'john@example.com' })).rejects.toThrow(
          '11000 duplicate key error collection: test.slugmodels index: email dup key: { email: "john@example.com" }'
        );
      });

      it.todo('correctly propagates error which is not caused by duplicate keys');

      it('creates slugs on simultaneous saves', async () => {
        const promises = [];
        for (let i = 0; i < 10; i++) {
          promises.push(
            Model.create({
              firstname: 'john',
              lastname: 'doe',
              city: 'memphis',
              country: 'usa',
              email: `test-${i}@example.com`
            })
          );
        }
        await Promise.all(promises);
        const docs = await Model.find({}).sort({ slug: 1 });
        expect(docs.map(doc => doc.slug)).toEqual([
          'john-doe',
          'john-doe-10',
          'john-doe-2',
          'john-doe-3',
          'john-doe-4',
          'john-doe-5',
          'john-doe-6',
          'john-doe-7',
          'john-doe-8',
          'john-doe-9'
        ]);
      });
    });

    describe('promises using `document.save`', () => {
      it('generates another slug in case of a conflict', async () => {
        await Model.create({
          firstname: 'john',
          lastname: 'doe',
          city: 'memphis',
          country: 'usa',
          email: 'john@example.com'
        });
        const doc2 = new Model({
          firstname: 'john',
          lastname: 'doe',
          city: 'memphis',
          country: 'usa',
          email: 'john2@example.com'
        });
        await doc2.save();
        expect(doc2.slug).toEqual('john-doe-2');
      });
    });

    describe('generating duplicate slugs within one sequence', () => {
      let Model2: mongoose.Model<MyDocument>;
      let sluggerOptions2: SluggerOptions<MyDocument>;

      beforeAll(async () => {
        const schema2 = new mongoose.Schema({
          firstname: String,
          slug: String
        });

        schema2.index({ slug: 1 }, { name: 'slug', unique: true });

        sluggerOptions2 = {
          slugPath: 'slug',
          generateFrom: doc => doc.firstname,
          index: 'slug'
        };

        schema2.plugin(sluggerPlugin, sluggerOptions2);

        Model2 = mongoose.model<MyDocument>('SlugModel2', schema2);
        await Model2.ensureIndexes();
      });

      it('throws when same slugs are generated within one save cycle using `Model.create`', async () => {
        await Model2.create({ firstname: 'john' });
        await expect(() => Model2.create({ firstname: 'john' })).rejects.toThrow(
          new SluggerError("Already attempted slug 'john' 3 times before. Giving up.")
        );
      });

      it('throws when same slugs are generated within one save cycle using `document.save`', async () => {
        await Model2.create({ firstname: 'john' });
        await expect(() => new Model2({ firstname: 'john' }).save()).rejects.toThrow(
          new SluggerError("Already attempted slug 'john' 3 times before. Giving up.")
        );
      });
    });

    describe('generating slugs with `maxlength` on schema', () => {
      let Model3: mongoose.Model<MyDocument>;
      let sluggerOptions3: SluggerOptions<MyDocument>;

      beforeAll(async () => {
        const schema3 = new mongoose.Schema({
          firstname: String,
          slug: { type: String, maxlength: 25 }
        });

        schema3.index({ slug: 1 }, { name: 'slug', unique: true });

        sluggerOptions3 = {
          slugPath: 'slug',
          generateFrom: 'firstname',
          index: 'slug'
        };

        schema3.plugin(sluggerPlugin, sluggerOptions3);

        Model3 = mongoose.model<MyDocument>('SlugModel3', schema3);
        await Model3.ensureIndexes();
      });

      it('shortens slugs to `maxlength`', async () => {
        const doc = await Model3.create({
          firstname: 'Salvador Felipe Jacinto Dalí y',
          lastname: 'Domenech'
        });
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

        const sluggerOptions4 = {
          slugPath: 'slug',
          generateFrom: 'firstname',
          index: 'slug',
          maxLength: 25
        };

        schema4.plugin(sluggerPlugin, sluggerOptions4);

        Model4 = mongoose.model<MyDocument>('SlugModel4', schema4);
        await Model4.ensureIndexes();
      });

      it('shortens slugs to `maxlength`', async () => {
        const doc = await Model4.create({
          firstname: 'Salvador Felipe Jacinto Dalí y',
          lastname: 'Domenech'
        });
        expect(doc.slug).toHaveLength(25);
        expect(doc.slug).toEqual('salvador-felipe-jacinto-d');
      });
    });

    /** https://lineupr.sentry.io/issues/4184297415 */
    describe('generate slugs throws “Already attempted slug” error', () => {
      let Model5: mongoose.Model<MyDocument>;

      beforeAll(async () => {
        const schema5 = new mongoose.Schema({
          name: String,
          slug: String
        });

        schema5.index({ slug: 1 }, { name: 'slug', unique: true });

        const sluggerOptions5 = {
          slugPath: 'slug',
          generateFrom: 'name',
          index: 'slug',
          maxLength: 10
        };

        schema5.plugin(sluggerPlugin, sluggerOptions5);

        Model5 = mongoose.model<MyDocument>('SlugModel5', schema5);
        await Model5.ensureIndexes();
      });

      it('inserts sequentially numbered documents', async () => {
        const doc = await Model5.create({ name: 'Document 24' });
        expect(doc.slug).toEqual('document-2');

        // throws: Already attempted slug 'document-2' before. Giving up.
        const doc2 = await Model5.create({ name: 'Document 25' });
        expect(doc2.slug).toEqual('document-3');

        const doc3 = await Model5.create({ name: 'Document 24' });
        expect(doc3.slug).toEqual('document-4');

        const doc4 = await Model5.create({ name: 'Document 1' });
        expect(doc4.slug).toEqual('document-1');

        const doc5 = await Model5.create({ name: 'Document 1' });
        expect(doc5.slug).toEqual('document-5');
      });
    });

    describe('works on initial save', () => {
      let TestModel: mongoose.Model<any>;

      beforeAll(async () => {
        const schema = new mongoose.Schema({
          firstname: String,
          slug: String
        });

        schema.index({ slug: 1 }, { name: 'slug', unique: true });

        schema.plugin(sluggerPlugin, {
          slugPath: 'slug',
          generateFrom: 'firstname',
          index: 'slug'
        });

        TestModel = mongoose.model(`TestModel_${Date.now()}`, schema);
        await TestModel.ensureIndexes();
      });

      it('does not throw duplicate error on first save (concerns the “wrap” functionality)', async () => {
        // (1) add one document to DB without Mongoose
        await TestModel.collection.insertOne({ firstname: 'Bob', slug: 'bob' });
        // (2) before this fix, the following call would not use the slugger logic,
        //     as the modified save function would only applied *after* the first call
        const savedDocument = await TestModel.create({ firstname: 'Bob' });
        expect(savedDocument.slug).toEqual('bob-2');
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
      it('succeeds with proper version', () => {
        expect(() => utils.checkMongoDBVersion({ version: '4.2.0' })).not.toThrow();
      });
      it('throws with too old version', () => {
        expect(() => utils.checkMongoDBVersion({ version: '4.0.28' })).toThrow(
          'At least MongoDB version 4.2.0 is required, actual version is 4.0.28'
        );
      });
      it('throws on null argument', () => {
        expect(() => utils.checkMongoDBVersion(null)).toThrow('`status` is null or not an object');
      });
      it('throws on missing version property', () => {
        expect(() => utils.checkMongoDBVersion({})).toThrow('`status.version` is missing');
      });
      it('throws if version is not string', () => {
        expect(() => utils.checkMongoDBVersion({ version: 1 })).toThrow('`status.version` is not a string');
      });
    });

    describe('limax (fixed)', () => {
      it('limax character mapping', () => {
        const unmappedCharacters: string[] = [];
        for (let idx = 0; idx < 65535; idx++) {
          const char = String.fromCharCode(idx);
          const slugged = utils.limaxFixed(char);
          if (char === slugged) {
            unmappedCharacters.push(char);
          }
        }
        expect(unmappedCharacters.join('')).toEqual('0123456789abcdefghijklmnopqrstuvwxyz');
      });

      it('limax umlaut', () => {
        expect(utils.limaxFixed('Müsli')).toEqual('muesli');
        expect(utils.limaxFixed('Straße')).toEqual('strasse');
        expect(utils.limaxFixed('ÄÖÜ-äöü')).toEqual('aeoeue-aeoeue');
        expect(utils.limaxFixed('äää')).toEqual('aeaeae');
      });
    });

    describe('isModel', () => {
      it('returns false if not a Mongoose model', () => {
        expect(utils.isModel(undefined)).toEqual(false);
        expect(utils.isModel(null)).toEqual(false);
        expect(utils.isModel('string')).toEqual(false);
        expect(utils.isModel({})).toEqual(false);
        expect(utils.isModel(() => {})).toEqual(false);
      });
      it('returns true if a Mongoose model', () => {
        expect(utils.isModel(Model)).toEqual(true);
      });
    });
  });
});
