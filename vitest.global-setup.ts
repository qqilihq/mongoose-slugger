import { MongoMemoryServer } from 'mongodb-memory-server-global';
import type { TestProject } from 'vitest/node';

declare module 'vitest' {
  export interface ProvidedContext {
    MONGO_BASE_URI: string;
  }
}

let mongod: MongoMemoryServer;

export async function setup(project: TestProject) {
  mongod = await MongoMemoryServer.create({
    instance: {
      storageEngine: 'wiredTiger'
    }
  });
  project.provide('MONGO_BASE_URI', mongod.getUri());
}

export async function teardown() {
  if (mongod) {
    await mongod.stop();
    console.log('MongoDB Memory Server stopped');
  }
}
