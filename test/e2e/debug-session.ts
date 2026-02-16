/**
 * Simple debugging script for session flow
 * Run with: bun run test/e2e/debug-session.ts
 */

const BASE_URL = process.env.BASE_URL || "http://localhost:4096"
const AUTH_TOKEN = "user-test-user"  // Simple token format

async function main() {
  console.log(`🔍 Debugging session flow with base URL: ${BASE_URL}`)

  let sessionID: string | null = null

  try {
    // Step 1: Create session
    console.log("\n📝 Step 1: Creating session...")
    const createResponse = await fetch(`${BASE_URL}/session`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${AUTH_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        title: "Debug Test Session",
      }),
    })

    console.log(`   Status: ${createResponse.status}`)
    if (!createResponse.ok) {
      const errorText = await createResponse.text()
      console.error(`   ✗ Failed to create session`)
      console.error(`   Response: ${errorText}`)
      return
    }

    const session = await createResponse.json()
    sessionID = session.id
    console.log(`   ✓ Created session: ${sessionID}`)
    console.log(`   Project ID: ${session.projectID}`)
    console.log(`   User ID: ${session.userId || "none"}`)

    // Step 2: Get session details
    console.log(`\n📝 Step 2: Getting session details...`)
    const getUrl = `${BASE_URL}/session/${sessionID}`
    console.log(`   Fetching: ${getUrl}`)

    const getResponse = await fetch(getUrl, {
      headers: {
        "Authorization": `Bearer ${AUTH_TOKEN}`,
      },
    })

    console.log(`   Status: ${getResponse.status}`)

    if (getResponse.status === 500) {
      const errorText = await getResponse.text()
      console.error(`   ✗ 500 Internal Server Error!`)
      console.error(`   This indicates an unhandled exception on the server`)
      console.error(`   Response: ${errorText}`)
      console.error(`\n🔍 Check server logs for stack trace`)
      return
    }

    if (!getResponse.ok) {
      const errorText = await getResponse.text()
      console.error(`   ✗ Failed to get session`)
      console.error(`   Response: ${errorText}`)
      return
    }

    const retrievedSession = await getResponse.json()
    console.log(`   ✓ Retrieved session:`, {
      id: retrievedSession.id,
      title: retrievedSession.title,
      projectID: retrievedSession.projectID,
      userId: retrievedSession.userId,
    })

    // Step 3: List sessions
    console.log(`\n📝 Step 3: Listing sessions...`)
    const listResponse = await fetch(`${BASE_URL}/session`, {
      headers: {
        "Authorization": `Bearer ${AUTH_TOKEN}`,
      },
    })

    console.log(`   Status: ${listResponse.status}`)

    if (!listResponse.ok) {
      const errorText = await listResponse.text()
      console.error(`   ✗ Failed to list sessions`)
      console.error(`   Response: ${errorText}`)
      return
    }

    const sessions = await listResponse.json()
    console.log(`   ✓ Found ${sessions.length} session(s)`)

    if (sessions.length === 0) {
      console.warn(`   ⚠️  Warning: Session list is empty!`)
      console.warn(`   This suggests Session.list() is not finding sessions`)
    }

    // Step 4: Send a message
    console.log(`\n📝 Step 4: Sending message...`)
    const messageResponse = await fetch(`${BASE_URL}/message`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${AUTH_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        sessionID,
        agent: "build",
        model: {
          providerID: "anthropic",
          modelID: "claude-sonnet-4-5-20250929",
        },
        content: "Hello from debug script!",
      }),
    })

    console.log(`   Status: ${messageResponse.status}`)

    if (!messageResponse.ok) {
      const errorText = await messageResponse.text()
      console.error(`   ✗ Failed to send message`)
      console.error(`   Response: ${errorText}`)
      return
    }

    const message = await messageResponse.json()
    console.log(`   ✓ Message sent: ${message.id}`)

    // Step 5: Get session messages
    console.log(`\n📝 Step 5: Getting session messages...`)
    const messagesUrl = `${BASE_URL}/session/${sessionID}/messages`
    const messagesResponse = await fetch(messagesUrl, {
      headers: {
        "Authorization": `Bearer ${AUTH_TOKEN}`,
      },
    })

    console.log(`   Status: ${messagesResponse.status}`)

    if (!messagesResponse.ok) {
      const errorText = await messagesResponse.text()
      console.error(`   ✗ Failed to get messages`)
      console.error(`   Response: ${errorText}`)
      return
    }

    const messagesData = await messagesResponse.json()
    const messages = messagesData.data || []
    console.log(`   ✓ Found ${messages.length} message(s)`)

    console.log(`\n✅ All tests passed!`)
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

main()
