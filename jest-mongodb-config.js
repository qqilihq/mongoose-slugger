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
