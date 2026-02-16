/**
 * Skills API
 *
 * Provides endpoints for listing, retrieving, and starting skills.
 */

import { Hono } from "hono"
import { Skill } from "@/skill/skill"
import { Log } from "@/util/log"
import { DockerManager } from "@/docker/docker-manager"
import { Session } from "@/session"
import { Instance } from "@/project/instance"
import { z } from "zod"
import { validator } from "hono/validator"
import { extractUserFromToken } from "./middleware/auth"

export namespace SkillsRoute {
  const log = Log.create({ service: "server.skills" })

  const app = new Hono()

  /**
   * GET /
   *
   * List all available skills
   */
  app.get("/", async (c) => {
    // Skills require Instance context - if no context, return empty list
    try {
      const skills = await Skill.all()
      return c.json({
        skills: skills.map(s => ({
          id: s.name, // using name as id for now
          name: s.name,
          description: s.description,
          location: s.location,
          // Add more metadata if available
        }))
      })
    } catch (e: any) {
      // No instance context - return empty skills list
      if (e?.message?.includes("No context found")) {
        return c.json({ skills: [] })
      }
      throw e
    }
  })

  /**
   * GET /:name
   *
   * Get detailed information about a specific skill
   */
  app.get("/:name", async (c) => {
    const name = c.req.param("name")

    try {
      const skill = await Skill.get(name)

      if (!skill) {
        return c.json({ error: "Skill not found" }, 404)
      }

      // Read skill content
      const { ConfigMarkdown } = await import("@/config/markdown")
      const parsed = await ConfigMarkdown.parse(skill.location)

      return c.json({
        id: skill.name,
        name: skill.name,
        description: skill.description,
        content: parsed?.content || "",
        location: skill.location,
      })
    } catch (e: any) {
      // No instance context
      if (e?.message?.includes("No context found")) {
        return c.json({ error: "No active project context" }, 503)
      }
      throw e
    }
  })

  /**
   * POST /:name/start
   *
   * Start a session with this skill (Sandboxed)
   */
  app.post("/:name/start", async (c) => {
    const name = c.req.param("name")
    const skill = await Skill.get(name)

    if (!skill) {
      return c.json({ error: "Skill not found" }, 404)
    }

    try {
      const body = await c.req.json()
      const projectDir = body.projectDir || Instance.directory

      // Extract userId from auth token for session isolation
      const userCtx = await extractUserFromToken(c.req.header("Authorization"))

      // Create a new session
      const session = await Session.create({
        title: `Skill: ${skill.name}`,
        mode: "sandbox", // Ensure session is marked as sandbox
        userId: userCtx?.userId,
      })

      // Initialize Docker Sandbox
      // Note: User-level containers use projectID as the key
      const dockerManager = DockerManager.getInstance()
      await dockerManager.createForSession(session.projectID, projectDir)
      await dockerManager.start(session.projectID)

      // Return session info so frontend can navigate
      return c.json({
        sessionId: session.id,
        status: "started"
      })

    } catch (error: any) {
      log.error("Failed to start skill session", { name, error })
      return c.json({ error: error.message || "Failed to start skill session" }, 500)
    }
  })

  /**
   * GET /:name/icon
   *
   * Get the skill icon
   */
  app.get("/:name/icon", async (c) => {
    const name = c.req.param("name")

    try {
      const skill = await Skill.get(name)

      if (!skill) {
        return c.notFound()
      }

      // Icon is expected to be next to the SKILL.md file
      const { dirname, join } = await import("path")
      const { exists, stat } = await import("fs/promises") // Use fs/promises for file check
      
      const skillDir = dirname(skill.location)
      const iconPath = join(skillDir, "icon.png")

      if (!(await exists(iconPath))) {
        return c.notFound()
      }

      const file = Bun.file(iconPath)
      return new Response(file, {
        headers: {
          "Content-Type": "image/png",
          "Cache-Control": "public, max-age=3600"
        }
      })
    } catch (e: any) {
      log.error("Failed to serve skill icon", { name, error: e })
      return c.json({ error: "Failed to serve icon" }, 500)
    }
  })

  export const route = app
}
