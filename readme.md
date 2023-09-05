# Slugger for Mongoose

[![Build Status](https://img.shields.io/endpoint.svg?url=https%3A%2F%2Factions-badge.atrox.dev%2Fqqilihq%2Fmongoose-slugger%2Fbadge%3Fref%3Dmaster&style=flat)](https://actions-badge.atrox.dev/qqilihq/mongoose-slugger/goto?ref=master)
[![codecov](https://codecov.io/gh/qqilihq/mongoose-slugger/branch/master/graph/badge.svg)](https://codecov.io/gh/qqilihq/mongoose-slugger)
[![npm version](https://badge.fury.io/js/mongoose-slugger-plugin.svg)](https://badge.fury.io/js/mongoose-slugger-plugin)

Automatically generates so called “slugs” for [Mongoose](http://mongoosejs.com) documents. Slugs are typically used as human-readable parts of URLs instead of machine-readable identifiers (see e.g. [here](https://stackoverflow.com/questions/427102/what-is-a-slug-in-django) or [here](https://stackoverflow.com/questions/19335215/what-is-a-slug)).

In case a slug is already taken by an existing document, the plugin automatically creates a new one (typically using a sequence number) and keeps trying until the document can be saved successfully.

When correctly configured, the plugin will do the following:

```javascript
Model.create({ firstname: 'john', lastname: 'doe' }); // slug = 'john-doe'
Model.create({ firstname: 'jane', lastname: 'roe' }); // slug = 'jane-roe'
Model.create({ firstname: 'john', lastname: 'doe' }); // slug = 'john-doe-2'
```

There exist several similar Mongoose plugins already, however, none of them fit our requirements. These are:

* We do not want to maintain a separate collection for storing any state.

* Saving with a generated slug must work atomically. This means: First performing a query to check whether a slug is not yet taken and then saving a document is not acceptable!

* We need the ability for “scoped” slugs. This means: Slugs can be unique with regards to other document properties (e.g. have unique person name slugs in regards to a place, …)

* It must be possible to specify the slug generation strategy.

## Caveats

1. For now, only **one** slugger instance per schema can be used.

2. In the very worst case, this will perform a very high amount of attempts to insert. This is by design, as we assume that potential conflicts are relatively rare and, if they happen, can be circumvented by an acceptable amount of retries.

## Installation

```shell
$ yarn add mongoose-slugger-plugin
```

## Usage

```javascript
import { sluggerPlugin, sluggerWrap } from 'mongoose-slugger-plugin';

const schema = new mongoose.Schema({
  firstname: String,
  lastname: String,
  city: String,
  slug: String
});

// create a unique index for slug generation;
// here, the slugs must be unique for each city
schema.index({ city: 1, slug: 1 }, { name: 'city_slug', unique: true });

// add the plugin
schema.plugin(sluggerPlugin, {
  // the property path which stores the slug value
  slugPath: 'slug',
  // specify the properties which will be used for generating the slug
  generateFrom: ['firstname', 'lastname'],
  // specify the max length for the slug
  maxLength: 30,
  // the unique index, see above
  index: 'city_slug'
});

let Model = mongoose.model('MyModel', schema);

// make sure to wrap the Mongoose model
Model = sluggerWrap(Model);
```

`maxLength` can be explicitly specified in the plugin options. This plugin will read the maximum allowed length from Mongoose `schema` or the plugin options.

## Development

Install NPM dependencies with `yarn`.

To execute the tests, run the `test` task. It starts a new MongoDB instance using [@shelf/jest-mongodb](https://github.com/shelfio/jest-mongodb) and then executes the test cases. The test coverage report can be found in `coverage/index.html`.

Use [Volta](https://volta.sh) to automatically configure the proper Node version.

For the best development experience, make sure that your editor supports [ESLint](https://eslint.org/docs/user-guide/integrations) and [EditorConfig](http://editorconfig.org).

Linting of code and commit message happens on commit via [Husky](https://github.com/typicode/husky).

## Releasing to NPM

Commit all changes and run the following:

```shell
$ npm login
$ yarn version --<update_type>
$ npm publish
```

… where `<update_type>` is one of `patch`, `minor`, or `major`. This will update the `package.json`, and create a tagged Git commit with the version number.


## Why yet Another Tool?

There’s a plethora of similar plugins, most of them old and abandoned though. Here’s a list, sorted by recent activity (first was updated recently when writing this):

* https://github.com/talha-asad/mongoose-url-slugs
* https://github.com/ladjs/mongoose-slug-plugin
* https://github.com/Kubide/mongoose-slug-generator
* https://github.com/budiadiono/mongoose-slug-hero
* https://github.com/dariuszp/mongoose-sluggable
* https://github.com/ChimboteDevClub/mongoose-slug-unique
* https://github.com/punkave/mongoose-uniqueslugs



## Contributing

Pull requests are very welcome. Feel free to discuss bugs or new features by opening a new [issue](https://github.com/qqilihq/mongoose-slugger/issues).

- - -

Copyright Philipp Katz, [LineUpr GmbH](http://lineupr.com), 2018 – 2023
