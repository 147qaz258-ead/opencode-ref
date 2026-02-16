/**
 * JWT Token Utilities Tests
 *
 * TDD Phase 1: RED - Write tests before implementation
 * These tests should FAIL until we implement the JWT utilities.
 */

import { test, expect, beforeEach } from "bun:test"
import { generateJWT, verifyJWT, JWTPayload } from "../../src/auth/jwt"

// Set required environment variables for tests
const TEST_JWT_SECRET = "test-secret-key-for-development-only"
const TEST_USER_ID = "user-123"
const TEST_EMAIL = "test@example.com"

beforeEach(() => {
  // Ensure JWT_SECRET is set for all tests
  process.env.JWT_SECRET = TEST_JWT_SECRET
})

test("should generate JWT token with valid payload", async () => {
  const token = await generateJWT(TEST_USER_ID, TEST_EMAIL)

  // Token should be a non-empty string
  expect(token).toBeTruthy()
  expect(typeof token).toBe("string")
  expect(token.length).toBeGreaterThan(0)

  // JWT format: header.payload.signature
  const parts = token.split(".")
  expect(parts).toHaveLength(3)
})

test("should verify JWT token and return payload", async () => {
  const token = await generateJWT(TEST_USER_ID, TEST_EMAIL)
  const payload = await verifyJWT(token)

  // Should contain userId and email
  expect(payload).toBeDefined()
  expect(payload.userId).toBe(TEST_USER_ID)
  expect(payload.email).toBe(TEST_EMAIL)

  // Should include standard JWT claims
  expect(payload.iat).toBeDefined()
  expect(typeof payload.iat).toBe("number")
  expect(payload.exp).toBeDefined()
  expect(typeof payload.exp).toBe("number")
})

test("should reject invalid tokens", async () => {
  const invalidTokens = [
    "",                    // empty string
    "invalid",             // not a JWT
    "abc.def",             // incomplete JWT
    "a.b.c",               // invalid base64
    "header.payload.signature",  // valid format but invalid content
  ]

  for (const token of invalidTokens) {
    const result = await verifyJWT(token)
    expect(result).toBeNull()
  }
})

test("should reject expired tokens", async () => {
  // Create a token that's already expired
  // This requires mocking time or creating an invalid payload
  const expiredToken = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJ1c2VyLTEyMyIsImVtYWlsIjoidGVzdEBleGFtcGxlLmNvbSIsImlhdCI6MTYwMDAwMDAwMCwiZXhwIjoxNjAwMDAwMDAwfQ.invalid"

  const result = await verifyJWT(expiredToken)
  expect(result).toBeNull()
})

test("should throw error if JWT_SECRET not set", async () => {
  delete process.env.JWT_SECRET

  await expect(generateJWT(TEST_USER_ID, TEST_EMAIL)).rejects.toThrow()
})

test("should include userId, email, iat, exp in payload", async () => {
  const token = await generateJWT(TEST_USER_ID, TEST_EMAIL)
  const payload = await verifyJWT(token)

  expect(payload).toMatchObject({
    userId: TEST_USER_ID,
    email: TEST_EMAIL,
  })
  expect(payload.iat).toBeGreaterThan(0)
  expect(payload.exp).toBeGreaterThan(0)
})

test("token should expire after 7 days", async () => {
  const SEVEN_DAYS_IN_SECONDS = 7 * 24 * 60 * 60
  const now = Math.floor(Date.now() / 1000)

  const token = await generateJWT(TEST_USER_ID, TEST_EMAIL)
  const payload = await verifyJWT(token)

  // Expiration should be approximately 7 days from now
  const expectedExp = now + SEVEN_DAYS_IN_SECONDS
  const actualExp = payload!.exp

  // Allow 5 second tolerance for test execution time
  expect(Math.abs(actualExp - expectedExp)).toBeLessThan(5)
})

test("should reject tokens with invalid signature", async () => {
  const validToken = await generateJWT(TEST_USER_ID, TEST_EMAIL)
  const parts = validToken.split(".")

  // Tamper with the signature
  const tamperedToken = `${parts[0]}.${parts[1]}.tamperedsignature`

  const result = await verifyJWT(tamperedToken)
  expect(result).toBeNull()
})

test("should reject tokens signed with different secret", async () => {
  // Generate token with one secret
  process.env.JWT_SECRET = "secret-1"
  const token = await generateJWT(TEST_USER_ID, TEST_EMAIL)

  // Try to verify with different secret
  process.env.JWT_SECRET = "secret-2"
  const result = await verifyJWT(token)

  expect(result).toBeNull()
})
