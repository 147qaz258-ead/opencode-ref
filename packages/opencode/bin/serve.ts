#!/usr/bin/env bun
/**
 * OpenCode Web Server
 *
 * Starts the OpenCode web server on the specified port.
 */

const { Server } = await import("../src/server/server.ts")

const port = parseInt(process.env.PORT || "4096")
const hostname = process.env.HOST || "0.0.0.0"
const mdns = process.env.MDNS === "true"

const server = Server.listen({
  port,
  hostname,
  mdns,
})

console.log(`OpenCode server started on ${server.url}`)
console.log(`Press Ctrl+C to stop`)

// Keep process alive
process.on("SIGINT", () => {
  console.log("\nShutting down...")
  server.stop(true)
  process.exit(0)
})

process.on("SIGTERM", () => {
  server.stop(true)
  process.exit(0)
})
