module.exports = {
  mongodbMemoryServerOptions: {
    instance: {
      dbName: 'slugger',
      // https://github.com/nodkz/mongodb-memory-server/issues/78
      storageEngine: 'wiredTiger'
    },
    binary: {
      version: '3.4.6',
      skipMD5: true
    },
    autoStart: false
  }
};
