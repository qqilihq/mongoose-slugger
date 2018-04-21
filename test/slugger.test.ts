import expect = require('expect.js');
import * as mongoose from 'mongoose';
import * as slugger from '../lib/slugger';
const limax = require('limax');

interface IMyDocument extends mongoose.Document {
  firstname: string;
  lastname: string;
  city: string;
  country: string;
  slug: string;
  email: string;
}

describe('slugger', () => {

  let Model: mongoose.Model<IMyDocument>;
  let sluggerOptions: slugger.SluggerOptions<IMyDocument>;

  before(() => {

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

    sluggerOptions = new slugger.SluggerOptions<IMyDocument>({

      slugPath: 'slug',

      generator: (doc, attempt) => {
        let result = limax([ doc.firstname, doc.lastname ].join(' '));
        if (attempt > 0) {
          result += `-${attempt + 1}`;
        }
        return result;
      },

      // TODO add an alternative syntax like so
      // generateFrom: [ 'firstname', 'lastname' ],

      // TODO make it also work with nested fields like so
      // generateFrom: [ 'name.first', 'name.last' ],

      index: 'city_country_slug'

    });

    schema.plugin(slugger.plugin, sluggerOptions);

    Model = mongoose.model<IMyDocument>('SlugModel', schema);
    Model = slugger.wrap(Model);

  });

  describe('options validation', () => {

    it('throws when creating config with missing object', () => {
      expect(() => new slugger.SluggerOptions()).to.throwError(/config is missing./);
    });

    it('throws error when configuration is missing', () => {
      expect(slugger.plugin).withArgs().to.throwError(/options are missing./);
    });

    it('throws error when neither `generateFrom` nor `generate` is given', () => {
      expect(() => new slugger.SluggerOptions({ index: 'slug' })).to.throwError(/`generateFrom` or `generator` is missing./);
    });

    it('throws error when index is missing', () => {
      expect(() => new slugger.SluggerOptions({})).to.throwError(/`index` is missing./);
    });

    it('throws error when specified index does not exist', () => {
      const schema = new mongoose.Schema({ name: String });
      const sluggerOptions: slugger.SluggerOptions<any> = new slugger.SluggerOptions({ generateFrom: 'name', index: 'does_not_exist' });
      expect(slugger.plugin).withArgs(schema, sluggerOptions).to.throwError(/schema contains no index with name 'does_not_exist'./);
    });

    it('throws error when applied more than once on a single schema', () => {
      const schema = new mongoose.Schema({ name: String });
      schema.index({ name: 1 }, { name: 'name', unique: true });
      const sluggerOptions: slugger.SluggerOptions<any> = new slugger.SluggerOptions({ generateFrom: 'name', index: 'name' });
      schema.plugin(slugger.plugin, sluggerOptions);
      expect(() => schema.plugin(slugger.plugin, sluggerOptions)).to.throwError(/slugger was added more than once./);
    });

    it('throws error when index is not unique', () => {
      const schema = new mongoose.Schema({ name: String });
      schema.index({ name: 1 }, { name: 'name' });
      const sluggerOptions: slugger.SluggerOptions<any> = new slugger.SluggerOptions({ generateFrom: 'name', index: 'name' });
      expect(() => schema.plugin(slugger.plugin, sluggerOptions)).to.throwError(/the index 'name' is not unique./);

    });

    it('throws error when calling `wrap` on a model without plugin', () => {
      const schema = new mongoose.Schema({ name: String });
      const model = mongoose.model('TestModel', schema);
      expect(() => slugger.wrap(model)).to.throwError(/slugger was not added./);
    });

  });

  describe('default generator', () => {

    let doc: IMyDocument;

    beforeEach(() => {
      doc = new Model({ firstname: 'john', lastname: 'doe' });
    });

    describe('single property', () => {

      const generator = slugger.createDefaultGenerator('firstname');

      it('generates slug for sequence 0', () => {
        expect(generator(doc, 0)).to.eql('john');
      });

      it('generates slug for sequence 1', () => {
        expect(generator(doc, 1)).to.eql('john-2');
      });

    });

    describe('multiple properties', () => {

      const generator = slugger.createDefaultGenerator([ 'firstname', 'lastname' ]);

      it('generates slug', () => {
        expect(generator(doc, 1)).to.eql('john-doe-2');
      });

      it('ignores missing values', () => {
        expect(generator(new Model({ firstname: 'john' }), 1)).to.eql('john-2');
      });

    });

  });

  describe('validation', () => {

    it('generates slug on validate', async () => {
      const doc = new Model({ firstname: 'john', lastname: 'doe' });
      await doc.validate();
      expect(doc.slug).to.eql('john-doe');
    });

  });

  describe('saving to database', function () {

    this.timeout(10 * 1000);
    this.slow(1000);

    // mongoose.set('debug', true);

    before(() => mongoose.connect('mongodb://localhost:27017/slugger-test', {
      connectTimeoutMS: 30 * 1000 /* 30 seconds */
    }));
    beforeEach(() => Model.remove({}).exec());
    after(() => mongoose.connection.close());

    describe('using helper function', () => {

      it('generates another slug in case of a conflict', async () => {
        await Model.create({ firstname: 'john', lastname: 'doe', city: 'memphis', country: 'usa', email: 'john@example.com' });
        const doc2 = await slugger.saveSlugWithRetries(new Model({ firstname: 'john', lastname: 'doe', city: 'memphis', country: 'usa', email: 'john2@example.com' }), sluggerOptions);
        expect(doc2.slug).to.eql('john-doe-2');
      });

      it('generates slug sequence', async () => {
        await Model.create({ firstname: 'john', lastname: 'doe', city: 'memphis', country: 'usa', email: 'john@example.com' }); // slug = john-doe
        for (let n = 2; n <= 10; n++) {
          const doc = await slugger.saveSlugWithRetries(new Model({ firstname: 'john', lastname: 'doe', city: 'memphis', country: 'usa', email: `john${n}@example.com` }), sluggerOptions);
          expect(doc.slug).to.eql(`john-doe-${n}`);
        }
      });

    });

    describe('promises', () => {

      it('generates slug', async () => {
        const doc = await Model.create({ firstname: 'john', lastname: 'doe', city: 'memphis', country: 'usa' });
        expect(doc.slug).to.eql('john-doe');
      });

      it('generates another slug in case of a conflict', async () => {
        await Model.create({ firstname: 'john', lastname: 'doe', city: 'memphis', country: 'usa', email: 'john@example.com' });
        const doc2 = await Model.create({ firstname: 'john', lastname: 'doe', city: 'memphis', country: 'usa', email: 'john2@example.com' });
        expect(doc2.slug).to.eql('john-doe-2');
      });

      it('generates no slug when explicity specified', async () => {
        const doc = await Model.create({ firstname: 'john', lastname: 'doe', city: 'memphis', country: 'germany', slug: 'john' });
        expect(doc.slug).to.eql('john');
      });

      it('correctly propagates error which is caused by duplicate on different index', async () => {
        await Model.create({ firstname: 'john', lastname: 'doe', email: 'john@example.com' });
        try {
          await Model.create({ firstname: 'john', lastname: 'dope', email: 'john@example.com' });
          expect().fail();
        } catch (e) {
          expect(e).to.be.an('object');
          expect(e.code).to.eql(11000);
        }
      });

      it('correctly propagates error which is not caused by duplicate keys');

    });

    describe('callbacks', () => {

      it('does not return promises when using callbacks', (done) => {
        const result = new Model({}).save((err, product) => done(err));
        expect(result).to.be(undefined);
      });

      it('generates slug', (done) => {
        // tslint:disable-next-line:no-floating-promises
        new Model({ firstname: 'john', lastname: 'doe', city: 'memphis', country: 'usa' }).save((err, product) => {
          expect(err).to.be(undefined);
          expect(product).to.be.an('object');
          done();
        });
      });

      it('generates another slug in case of a conflict', (done) => {
        // tslint:disable-next-line:no-floating-promises
        new Model({ firstname: 'john', lastname: 'doe', city: 'memphis', country: 'usa', email: 'john@example.com' }).save((err, product) => {
          if (err) return done(err);
          // tslint:disable-next-line:no-floating-promises
          new Model({ firstname: 'john', lastname: 'doe', city: 'memphis', country: 'usa', email: 'john2@example.com' }).save((err, product) => {
            if (err) return done(err);
            expect(err).to.be(undefined);
            expect(product.slug).to.eql('john-doe-2');
            done();
          });
        });
      });

      it('propagates error which is caused by duplicate on different index', (done) => {
        // tslint:disable-next-line:no-floating-promises
        new Model({ firstname: 'john', lastname: 'doe', email: 'john@example.com' }).save((err, product) => {
          if (err) return done(err);
          // tslint:disable-next-line:no-floating-promises
          new Model({ firstname: 'john', lastname: 'dope', email: 'john@example.com' }).save((err, product) => {
            expect(err).to.be.an('object');
            expect(err.code).to.eql(11000);
            done();
          });
        });
      });

    });

    describe('utilities', () => {
      it('extracts index name from error message', () => {
        const message = 'E11000 duplicate key error collection: slugger-test.slugmodels index: city_country_slug dup key: { : "memphis", : "usa", : "john-doe" }';
        expect(slugger.extractIndexNameFromError(message)).to.eql('city_country_slug');
      });
      it('returns `undefined` in case of no match', () => {
        expect(slugger.extractIndexNameFromError('foo')).to.be(undefined);
      });
    });

  });

});
