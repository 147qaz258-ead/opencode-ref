import { Bus } from "../src/bus";
import { Session } from "../src/session";

async function main() {
  const args = process.argv.slice(2);
  let sessionId = args[0];

  if (!sessionId) {
    console.log("No session ID provided, fetching latest session...");
    try {
        const sessions = [];
        for await (const s of Session.list()) {
            sessions.push(s);
        }

        if (sessions.length > 0) {
            // Sort by timestamp if available
            sessions.sort((a, b) => (a.time?.updated || 0) - (b.time?.updated || 0));
            sessionId = sessions[sessions.length - 1].id;
            console.log(`Using latest session: ${sessionId}`);
        } else {
            console.error("No active sessions found.");
            process.exit(1);
        }
    } catch (e) {
        console.error("Failed to list sessions:", e);
        process.exit(1);
    }
  }

  console.log(`Sending VNC event for session ${sessionId}...`);

  await Bus.publish(Bus.MonitorAction, {
    sessionId: sessionId,
    actionId: `action-${Date.now()}`,
    timestamp: Date.now(),
    renderType: "vnc",
    data: {
        vncUrl: `/api/session/${sessionId}/vnc/ws`,
    },
  });

  console.log("Event sent!");
}

main().catch(console.error);
