/**
 * Final Session Test - Core Functionality
 * Tests the critical session features that were failing
 */

const BASE_URL = process.env.BASE_URL || "http://127.0.0.1:4096"
const AUTH_TOKEN = "user-final-test"

async function runTests() {
  console.log(`🧪 Starting final session test`)
  console.log(`📍 Base URL: ${BASE_URL}\n`)

  let sessionID: string | null = null
  let passed = 0
  let failed = 0

  try {
    // Test 1: Create session
    console.log(`\n📝 Test 1: Creating session...`)
    const createResponse = await fetch(`${BASE_URL}/session`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${AUTH_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        title: "Final Test Session",
      }),
    })

    if (!createResponse.ok) {
      const error = await createResponse.text()
      console.error(`   ✗ FAILED`)
      console.error(`   Response: ${error}`)
      failed++
      return
    }

    const session = await createResponse.json()
    sessionID = session.id
    passed++

    console.log(`   ✅ PASSED`)
    console.log(`   Session ID: ${session.id}`)
    console.log(`   Project ID: ${session.projectID}`)
    console.log(`   User ID: ${session.userId || "none"}`)

    // Test 2: Get session details (the critical 500 error fix)
    console.log(`\n📝 Test 2: Getting session details...`)
    console.log(`   URL: ${BASE_URL}/session/${sessionID}`)

    const getResponse = await fetch(`${BASE_URL}/session/${sessionID}`, {
      headers: {
        "Authorization": `Bearer ${AUTH_TOKEN}`,
      },
    })

    console.log(`   Status: ${getResponse.status}`)

    if (getResponse.status === 500) {
      const error = await getResponse.text()
      console.error(`   ✗ FAILED - 500 Internal Server Error`)
      console.error(`   This was the original bug!`)
      console.error(`   Response: ${error}`)
      failed++
      return
    }

    if (!getResponse.ok) {
      const error = await getResponse.text()
      console.error(`   ✗ FAILED`)
      console.error(`   Response: ${error}`)
      failed++
      return
    }

    const retrievedSession = await getResponse.json()
    passed++

    console.log(`   ✅ PASSED`)
    console.log(`   Retrieved: ${retrievedSession.id}`)

    // Verify user isolation
    const expectedProjectID = `user-final-test`
    if (retrievedSession.projectID !== expectedProjectID) {
      console.warn(`   ⚠️  WARNING: projectID mismatch`)
      console.warn(`   Expected: ${expectedProjectID}`)
      console.warn(`   Got: ${retrievedSession.projectID}`)
      failed++
    } else {
      console.log(`   ✓ User isolation verified`)
    }

    // Test 3: List sessions
    console.log(`\n📝 Test 3: Listing all sessions...`)
    const listResponse = await fetch(`${BASE_URL}/session`, {
      headers: {
        "Authorization": `Bearer ${AUTH_TOKEN}`,
      },
    })

    console.log(`   Status: ${listResponse.status}`)

    if (!listResponse.ok) {
      const error = await listResponse.text()
      console.error(`   ✗ FAILED`)
      console.error(`   Response: ${error}`)
      failed++
      return
    }

    const sessions = await listResponse.json()
    passed++

    console.log(`   ✅ PASSED`)
    console.log(`   Found ${sessions.length} session(s)`)

    const ourSession = sessions.find((s: any) => s.id === sessionID)
    if (!ourSession) {
      console.warn(`   ⚠️  WARNING: Our created session not found in list!`)
      failed++
    } else {
      console.log(`   ✓ Our session found in list`)
    }

    // Summary
    console.log(`\n${"=".repeat(50)}`)
    console.log(`📊 Final Test Results`)
    console.log(`📊 Total tests: ${passed + failed}`)
    console.log(`✅ Passed: ${passed}`)
    console.log(`✗ Failed: ${failed}`)

    if (failed === 0) {
      console.log(`\n🎉 All tests passed!`)
    } else {
      console.log(`\n⚠️  Some tests failed - check logs above`)
    }

    console.log(`\n${"=".repeat(50)}`)

  } catch (error) {
    console.error(`\n✗ Unexpected error:`)
    console.error(error)
  } finally {
    // Cleanup
    if (sessionID) {
      console.log(`\n🧹 Cleaning up test session: ${sessionID}`)
      try {
        await fetch(`${BASE_URL}/session/${sessionID}`, {
          method: "DELETE",
          headers: {
            "Authorization": `Bearer ${AUTH_TOKEN}`,
          },
        })
        console.log(`   ✓ Session deleted`)
      } catch (error) {
        console.warn(`   ⚠️  Cleanup failed (non-fatal)`)
      }
    }
  }
}

runTests()
