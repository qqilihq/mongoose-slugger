module.exports = {
  mongodbMemoryServerOptions: {
    instance: {
      dbName: 'slugger',
      // https://github.com/nodkz/mongodb-memory-server/issues/78
      // storageEngine: 'wiredTiger'
      storageEngine: 'ephemeralForTest'
    },
    // set MongoDB version in `package.json` -> config -> mongodbMemoryServer -> version
    autoStart: false
  }
};

// tested using wiredTiger
// 6.0.5 : ok
// 5.0.16 : ok
// 4.2.0 : ok
// 4.0.28 : "E11000 duplicate key error collection: test.slugmodels index: email dup key: { : \"john@example.com\" }"
// 4.0.0 : "E11000 duplicate key error collection: test.slugmodels index: email dup key: { : \"john@example.com\" }"
// 3.6.23 : "E11000 duplicate key error collection: test.slugmodels index: email dup key: { : \"john@example.com\" }"

// tested using memory / ephemeralForTest
// 6.0.5 : ok
// 5.0.16 : ok
// 4.2.0 : ok
// 4.0.28 : "E11000 duplicate key error dup key: { : \"john@example.com\" }"
// 4.0.0 : "E11000 duplicate key error dup key: { : \"john@example.com\" }"
// 3.6.23 : "E11000 duplicate key error dup key: { : \"john@example.com\" }"
