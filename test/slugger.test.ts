import expect = require('expect.js');
import * as mongoose from 'mongoose';
import * as slugger from '../lib/slugger';
import * as limax from 'limax';

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

    schema.plugin(slugger.plugin, {

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

    } as slugger.SluggerOptions<IMyDocument>);

    Model = mongoose.model<IMyDocument>('SlugModel', schema);
    Model = slugger.wrap(Model);

  });

  describe('options validation', () => {

    it('throws error when configuration is missing', () => {
      expect(slugger.plugin).withArgs().to.throwError(/options are missing./);
    });

    it('throws error when neither `generateFrom` nor `generate` is given', () => {
      expect(slugger.plugin).withArgs(null, { index: 'slug' }).to.throwError(/`generateFrom` or `generator` is missing./);
    });

    it('throws error when specified index does not exist', () => {
      const schema = new mongoose.Schema({ name: String });
      const sluggerOptions: slugger.SluggerOptions<any> = { generateFrom: 'name', index: 'does_not_exist' };
      expect(slugger.plugin).withArgs(schema, sluggerOptions).to.throwError(/schema contains no index with name 'does_not_exist'./);
    });

  });

  describe('default generator', () => {

    let doc;

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

    before(() => mongoose.connect('mongodb://localhost:27017/slugger-test'));
    beforeEach(() => Model.remove({}));
    after(() => mongoose.connection.close());

    describe('using helper function', () => {

      it('generates another slug in case of a conflict', async () => {
        await Model.create({ firstname: 'john', lastname: 'doe', city: 'memphis', country: 'usa', email: 'john@example.com' });
        const doc2 = await slugger.saveSlugWithRetries(new Model({ firstname: 'john', lastname: 'doe', city: 'memphis', country: 'usa', email: 'john2@example.com' }));
        expect(doc2.slug).to.eql('john-doe-2');
      });

      it('generates slug sequence', async () => {
        await Model.create({ firstname: 'john', lastname: 'doe', city: 'memphis', country: 'usa', email: 'john@example.com' }); // slug = john-doe
        for (let n = 2; n <= 10; n++) {
          const doc = await slugger.saveSlugWithRetries(new Model({ firstname: 'john', lastname: 'doe', city: 'memphis', country: 'usa', email: `john${n}@example.com` }));
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

      it('generates slug', (done) => {
        // tslint:disable-next-line:no-floating-promises
        new Model({ firstname: 'john', lastname: 'doe', city: 'memphis', country: 'usa' }).save((err, product) => {
          expect(err).to.be(undefined);
          expect(product).to.be.an('object');
          done();
        });
      });

    });

  });

});
