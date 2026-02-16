/**
 * Test setup for auth tests
 * Mocks MongoDB storage to avoid database dependency
 */

import { mock } from "bun/test"

// Mock user storage for tests
interface MockUser {
  _id?: string
  googleId: string
  email: string
  name: string
  picture?: string
  createdAt: number
  lastLoginAt: number
}

const mockUsers = new Map<string, MockUser>()

// Mock the MongoDB storage module
const mockMongoStorage = {
  connect: mock(() => Promise.resolve()),
  read: mock(async (_collection: string, id: string) => {
    return mockUsers.get(id) || null
  }),
  write: mock(async (_collection: string, id: string, data: MockUser) => {
    mockUsers.set(id, { ...data, _id: data._id || id })
    return
  }),
  remove: mock(async (_collection: string, id: string) => {
    mockUsers.delete(id)
  }),
  list: mock(async (_collection: string) => {
    return Array.from(mockUsers.values())
  }),
  collection: mock(function(this: any, name: string) {
    return this
  }),
}

// Mock getMongoStorage function
mock.module("../../src/storage/mongodb", () => ({
  getMongoStorage: () => mockMongoStorage,
  MongoStorage: class MockMongoStorage {
    constructor() {}
    async connect() {}
  },
}))

// Clear mock users before each test
export function clearMockUsers() {
  mockUsers.clear()
}
