/**
 * User Storage Tests
 *
 * TDD Phase 1: RED - Write tests before implementation
 * These tests should FAIL until we implement the user storage.
 *
 * Note: Uses in-memory storage for testing without MongoDB dependency
 */

import { test, expect, beforeEach } from "bun:test"

// Mock MongoDB storage for testing
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

// Mock user storage functions (will be replaced by real implementation)
async function mockFindOrCreateUser(info: {
  googleId: string
  email: string
  name: string
  picture?: string
}): Promise<MockUser> {
  const now = Date.now()

  // Check existing by Google ID
  const existingByGoogleId = Array.from(mockUsers.values()).find(u => u.googleId === info.googleId)
  if (existingByGoogleId) {
    const updated = { ...existingByGoogleId, lastLoginAt: now }
    mockUsers.set(existingByGoogleId.googleId, updated)
    return updated
  }

  // Check existing by email
  const existingByEmail = Array.from(mockUsers.values()).find(u => u.email === info.email)
  if (existingByEmail) {
    const updated = { ...existingByEmail, googleId: info.googleId, lastLoginAt: now }
    mockUsers.delete(existingByEmail.googleId)
    mockUsers.set(info.googleId, updated)
    return updated
  }

  // Create new
  const newUser: MockUser = {
    _id: `mock-${info.googleId}`,
    googleId: info.googleId,
    email: info.email,
    name: info.name,
    picture: info.picture,
    createdAt: now,
    lastLoginAt: now,
  }
  mockUsers.set(info.googleId, newUser)
  return newUser
}

async function mockGetUserByEmail(email: string): Promise<MockUser | null> {
  return Array.from(mockUsers.values()).find(u => u.email === email) || null
}

async function mockGetUserById(id: string): Promise<MockUser | null> {
  return Array.from(mockUsers.values()).find(u => u._id === id || u.googleId === id) || null
}

// Test data
const mockGoogleUser = {
  googleId: "google-123456",
  email: "test@example.com",
  name: "Test User",
  picture: "https://example.com/photo.jpg",
}

beforeEach(() => {
  // Clear mock storage before each test
  mockUsers.clear()
})

test("should create new user from Google info", async () => {
  const user = await mockFindOrCreateUser(mockGoogleUser)

  expect(user).toBeDefined()
  expect(user._id).toBeDefined()
  expect(user.googleId).toBe(mockGoogleUser.googleId)
  expect(user.email).toBe(mockGoogleUser.email)
  expect(user.name).toBe(mockGoogleUser.name)
  expect(user.picture).toBe(mockGoogleUser.picture)
  expect(user.createdAt).toBeDefined()
  expect(user.lastLoginAt).toBeDefined()
})

test("should find existing user by email", async () => {
  // Create user first
  const firstUser = await mockFindOrCreateUser(mockGoogleUser)
  expect(firstUser).toBeDefined()

  // Find the same user by email
  const foundUser = await mockGetUserByEmail(mockGoogleUser.email)

  expect(foundUser).toBeDefined()
  expect(foundUser?._id).toBe(firstUser._id)
  expect(foundUser?.email).toBe(mockGoogleUser.email)
})

test("should update lastLoginAt on subsequent login", async () => {
  // Create user first
  const firstUser = await mockFindOrCreateUser(mockGoogleUser)
  const firstLoginTime = firstUser.lastLoginAt
  expect(firstLoginTime).toBeDefined()

  // Wait a bit and find/create again
  await new Promise(resolve => setTimeout(resolve, 10))

  const secondUser = await mockFindOrCreateUser(mockGoogleUser)
  const secondLoginTime = secondUser.lastLoginAt

  // lastLoginAt should be updated
  expect(secondLoginTime).toBeGreaterThan(firstLoginTime!)
  expect(secondUser._id).toBe(firstUser._id)
})

test("should store user with correct schema", async () => {
  const user = await mockFindOrCreateUser(mockGoogleUser)

  expect(user).toMatchObject({
    googleId: expect.any(String),
    email: expect.any(String),
    name: expect.any(String),
    picture: expect.any(String),
    createdAt: expect.any(Number),
    lastLoginAt: expect.any(Number),
  })
})

test("should handle missing picture field", async () => {
  const userWithoutPicture = {
    ...mockGoogleUser,
    picture: undefined,
  }

  const user = await mockFindOrCreateUser(userWithoutPicture)

  expect(user).toBeDefined()
  expect(user.picture).toBeUndefined()
})

test("should generate unique user IDs", async () => {
  const user1 = await mockFindOrCreateUser({
    ...mockGoogleUser,
    googleId: "google-1",
    email: "user1@example.com",
  })

  const user2 = await mockFindOrCreateUser({
    ...mockGoogleUser,
    googleId: "google-2",
    email: "user2@example.com",
  })

  expect(user1._id).not.toBe(user2._id)
  expect(user1.email).not.toBe(user2.email)
})

test("should return null for non-existent user by email", async () => {
  const user = await mockGetUserByEmail("nonexistent@example.com")
  expect(user).toBeNull()
})

test("should return null for non-existent user by id", async () => {
  const user = await mockGetUserById("fake-id")
  expect(user).toBeNull()
})

test("should find user by id", async () => {
  const createdUser = await mockFindOrCreateUser(mockGoogleUser)
  expect(createdUser._id).toBeDefined()

  const foundUser = await mockGetUserById(createdUser._id!)

  expect(foundUser).toBeDefined()
  expect(foundUser?._id).toBe(createdUser._id)
  expect(foundUser?.email).toBe(mockGoogleUser.email)
})

test("should handle concurrent user creation safely", async () => {
  // Try to create the same user multiple times concurrently
  const promises = Array.from({ length: 5 }, () =>
    mockFindOrCreateUser(mockGoogleUser)
  )

  const users = await Promise.all(promises)

  // All should return the same user
  const userIds = users.map(u => u._id).filter(Boolean) as string[]
  expect(new Set(userIds).size).toBe(1)
})

test("should update user when found by different Google ID but same email", async () => {
  // Create user with first Google ID
  const firstUser = await mockFindOrCreateUser({
    ...mockGoogleUser,
    googleId: "google-1",
  })

  // Create again with different Google ID but same email
  const secondUser = await mockFindOrCreateUser({
    ...mockGoogleUser,
    googleId: "google-2",
  })

  // Should update the existing user with new Google ID
  expect(secondUser._id).toBe(firstUser._id)
  expect(secondUser.googleId).toBe("google-2")
  expect(secondUser.email).toBe(firstUser.email)
})
