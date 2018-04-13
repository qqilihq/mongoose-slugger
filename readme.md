Slugger for Mongoose
====================

Automatically generates so called “slugs” for [Mongoose](http://mongoosejs.com) documents. Slugs are typically used as human-readable parts of URLs instead of machine-readable identifiers (see e.g. [here](https://stackoverflow.com/questions/427102/what-is-a-slug-in-django) or [here](https://stackoverflow.com/questions/19335215/what-is-a-slug)).

In case a slug is already taken by an existing document, the plugin automatically creates a new one (typically using a sequence number) and keeps trying until the document can be saved successfully.

There exist several similar Mongoose plugins already, however, none of them fit our requirements. These are:

* We do not want to maintain a separate collection for storing any state.

* Saving with a generated slug must work atomically. This means: First performing a query to check whether a slug is not yet taken and then saving a document is not acceptable!

* We need the ability for “scoped” slugs. This means: Slugs can be unique with regards to other document properties (e.g. have unique person name slugs in regards to a place, …)

* Must work with callbacks and promises.

* It must be possible to specify the slug generation strategy.

Caveats
-------

1. For now, only **one** slugger instance per schema can be used.

2. In the very worst case, this will perform a very high amount of attempts to insert. This is by design, as we assume that potential conflicts are relatively rare and, if they happen, can be circumvented by an acceptable amount of retries.


Usage
-----

```
const schema = new mongoose.Schema({
  firstname: String,
  lastname: String,
  city: String,
  slug: String
});

// create a unique index for slug generation;
// here, the slugs must be unique for each city
schema.index({ city: 1, slug: 1 }, { name: 'city_slug', unique: true });

// create the configuration
const sluggerOptions = new slugger.SluggerOptions({
  // the property path which stores the slug value
  slugPath: 'slug',
  // specify the properties which will be used for generating the slug
  generateFrom: [ 'firstname', 'lastname' ],
  // the unique index, see above
  index: 'city_slug'
});

// add the plugin
schema.plugin(slugger.plugin, sluggerOptions);

const Model = mongoose.model('MyModel', schema);

// make sure to wrap to Mongoose model
Model = slugger.wrap(Model, sluggerOptions);
```

Development
-----------

Install NPM dependencies with `yarn`.

To execute the tests, use the `test.sh` script. It starts a new MongoDB Docker container and then executes the test cases.


Why yet Another Tool?
---------------------

There’s a plethora of similar plugins, most of them old and abandoned though. Here’s a list, sorted by recent activity (first was updated recently when writing this):

* https://github.com/ladjs/mongoose-slug-plugin
* https://github.com/talha-asad/mongoose-url-slugs
* https://github.com/ellipticaldoor/slugify-mongoose
* https://github.com/Kubide/mongoose-slug-generator
* https://github.com/budiadiono/mongoose-slug-hero
* https://github.com/dariuszp/mongoose-sluggable
* https://github.com/ChimboteDevClub/mongoose-slug-unique
* https://github.com/punkave/mongoose-uniqueslugs



Contributing
------------

Pull requests are very welcome. Feel free to discuss bugs or new features by opening a new [issue](https://github.com/qqilihq/mongoose-slugger/issues).

- - -

Copyright Philipp Katz, LineUpr GmbH, 2018
