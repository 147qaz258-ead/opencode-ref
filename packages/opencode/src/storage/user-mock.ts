/**
 * In-Memory User Storage (for testing)
 *
 * This file provides a mock implementation of user storage
 * that doesn't require MongoDB. It's used for testing.
 */

import { Log } from "@/util/log"

const log = Log.create({ service: "storage.user.mock" })

/**
 * User information from OAuth providers
 */
export interface UserInfo {
  /** Google user ID */
  googleId: string
  /** User email */
  email: string
  /** User display name */
  name: string
  /** Profile picture URL (optional) */
  picture?: string
}

/**
 * Stored user document
 */
export interface User {
  /** MongoDB document ID */
  _id?: string | { toString: () => string }
  /** Google user ID */
  googleId: string
  /** User email */
  email: string
  /** User display name */
  name: string
  /** Profile picture URL */
  picture?: string
  /** Account creation timestamp */
  createdAt: number
  /** Last login timestamp */
  lastLoginAt: number
}

// In-memory storage
const mockUsers = new Map<string, User>()

/**
 * Find an existing user or create a new one (in-memory)
 */
export async function findOrCreateUser(info: UserInfo): Promise<User> {
  const now = Date.now()

  // Try to find existing user by Google ID first
  const existingByGoogleId = Array.from(mockUsers.values()).find(u => u.googleId === info.googleId)

  if (existingByGoogleId) {
    // Update last login time
    const updatedUser: User = {
      ...existingByGoogleId,
      lastLoginAt: now,
    }

    mockUsers.set(existingByGoogleId.googleId, updatedUser)
    log.info("User logged in (existing)", { googleId: info.googleId, email: info.email })

    return updatedUser
  }

  // Try to find by email (in case user exists but with different Google ID)
  const existingByEmail = Array.from(mockUsers.values()).find(u => u.email === info.email)

  if (existingByEmail) {
    // Update with new Google ID and login time
    const updatedUser: User = {
      ...existingByEmail,
      googleId: info.googleId,
      lastLoginAt: now,
    }

    // Delete old document and create new one with Google ID as key
    mockUsers.delete(existingByEmail.googleId)
    mockUsers.set(info.googleId, updatedUser)

    log.info("User logged in (existing, updated Google ID)", { googleId: info.googleId, email: info.email })
    return updatedUser
  }

  // Create new user
  const newUser: User = {
    _id: `mock-${info.googleId}`,
    googleId: info.googleId,
    email: info.email,
    name: info.name,
    picture: info.picture,
    createdAt: now,
    lastLoginAt: now,
  }

  mockUsers.set(info.googleId, newUser)
  log.info("New user created", { googleId: info.googleId, email: info.email })

  return newUser
}

/**
 * Find a user by email (in-memory)
 */
export async function getUserByEmail(email: string): Promise<User | null> {
  return Array.from(mockUsers.values()).find(u => u.email === email) || null
}

/**
 * Find a user by ID (in-memory)
 */
export async function getUserById(userId: string): Promise<User | null> {
  return Array.from(mockUsers.values()).find(u => {
    const id = u._id?.toString?.() || u._id
    return id === userId || u.googleId === userId
  }) || null
}

/**
 * Clear all users (for testing)
 */
export function clearMockUsers(): void {
  mockUsers.clear()
}

/**
 * Get all users (for testing)
 */
export function getAllMockUsers(): User[] {
  return Array.from(mockUsers.values())
}
