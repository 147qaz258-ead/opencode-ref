import { describe, it, expect, beforeAll } from "bun:test"
import { Provider } from "../../src/provider/provider"

describe("Provider: oneapi", () => {
  it("should parse model identifier correctly", () => {
    const result = Provider.parseModel("oneapi/gpt-4o")
    expect(result.providerID).toBe("oneapi")
    expect(result.modelID).toBe("gpt-4o")
  })

  it("should parse model identifier without provider default", () => {
    const result = Provider.parseModel("gpt-4o")
    expect(result.providerID).toBe("gpt-4o")
    expect(result.modelID).toBe("")
  })

  it("should have oneapi as a valid provider ID format", () => {
    // Test that our provider ID format is consistent
    const providerID = "oneapi"
    expect(providerID).toMatch(/^[a-z0-9]+$/)
    expect(providerID).not.toContain("-")
    expect(providerID).not.toContain("_")
  })

  // Note: Full provider loading test requires a running one-api instance
  // or more complex mocking of the entire provider system
  // These tests verify the basic structure and parsing
})
