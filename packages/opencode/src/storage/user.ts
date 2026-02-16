/**
 * User Storage
 *
 * Handles user data persistence using MongoDB.
 * Supports user creation, retrieval, and login tracking.
 */

import { Log } from "@/util/log"
import { getMongoStorage } from "./mongodb"
import type { ObjectId } from "mongodb"

const log = Log.create({ service: "storage.user" })

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
  _id?: ObjectId | string
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

/**
 * Collection name for users
 */
const USERS_COLLECTION = "users"

/**
 * Find an existing user or create a new one
 *
 * @param info - User information from OAuth provider
 * @returns User document
 *
 * @example
 *   const user = await findOrCreateUser({
 *     googleId: "google-123",
 *     email: "user@example.com",
 *     name: "John Doe",
 *     picture: "https://..."
 *   })
 */
export async function findOrCreateUser(info: UserInfo): Promise<User> {
  const storage = getMongoStorage()
  const now = Date.now()

  // Try to find existing user by Google ID first
  const existingByGoogleId = await storage.read<User>(USERS_COLLECTION, info.googleId)

  if (existingByGoogleId) {
    // Update last login time
    const updatedUser: User = {
      ...existingByGoogleId,
      lastLoginAt: now,
    }

    await storage.write<User>(USERS_COLLECTION, info.googleId, updatedUser)
    log.info("User logged in (existing)", { googleId: info.googleId, email: info.email })

    return updatedUser
  }

  // Try to find by email (in case user exists but with different Google ID)
  const allUsers = await storage.list<User>(USERS_COLLECTION)
  const existingByEmail = allUsers.find(u => u.email === info.email)

  if (existingByEmail) {
    // Update with new Google ID and login time
    const updatedUser: User = {
      ...existingByEmail,
      googleId: info.googleId,
      lastLoginAt: now,
    }

    // Delete old document and create new one with Google ID as key
    await storage.remove(USERS_COLLECTION, existingByEmail._id!.toString())
    await storage.write<User>(USERS_COLLECTION, info.googleId, updatedUser)

    log.info("User logged in (existing, updated Google ID)", { googleId: info.googleId, email: info.email })
    return updatedUser
  }

  // Create new user
  const newUser: User = {
    googleId: info.googleId,
    email: info.email,
    name: info.name,
    picture: info.picture,
    createdAt: now,
    lastLoginAt: now,
  }

  await storage.write<User>(USERS_COLLECTION, info.googleId, newUser)
  log.info("New user created", { googleId: info.googleId, email: info.email })

  return newUser
}

/**
 * Find a user by email
 *
 * @param email - User email address
 * @returns User document or null if not found
 *
 * @example
 *   const user = await getUserByEmail("user@example.com")
 */
export async function getUserByEmail(email: string): Promise<User | null> {
  const storage = getMongoStorage()
  const allUsers = await storage.list<User>(USERS_COLLECTION)

  return allUsers.find(u => u.email === email) || null
}

/**
 * Find a user by ID
 *
 * @param userId - User ID (MongoDB ObjectId or Google ID)
 * @returns User document or null if not found
 *
 * @example
 *   const user = await getUserById("google-123")
 */
export async function getUserById(userId: string): Promise<User | null> {
  const storage = getMongoStorage()

  // Try reading as Google ID first (storage key)
  let user = await storage.read<User>(USERS_COLLECTION, userId)

  // If not found, try searching all users (might be MongoDB ObjectId)
  if (!user) {
    const allUsers = await storage.list<User>(USERS_COLLECTION)
    user = allUsers.find(u => u._id?.toString() === userId) || null
  }

  return user
}

/**
 * Update user information
 *
 * @param googleId - Google user ID
 * @param updates - Partial user data to update
 * @returns Updated user document or null if not found
 */
export async function updateUser(
  googleId: string,
  updates: Partial<Omit<User, "googleId" | "createdAt">>
): Promise<User | null> {
  const storage = getMongoStorage()
  const user = await storage.read<User>(USERS_COLLECTION, googleId)

  if (!user) {
    return null
  }

  const updatedUser: User = {
    ...user,
    ...updates,
  }

  await storage.write<User>(USERS_COLLECTION, googleId, updatedUser)
  log.info("User updated", { googleId })

  return updatedUser
}
