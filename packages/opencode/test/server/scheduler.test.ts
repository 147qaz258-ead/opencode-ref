import { describe, it, expect, beforeEach } from "bun:test"
import { Hono } from "hono"
import { SchedulerRoute } from "../../src/server/scheduler"
import { z } from "zod"

describe("Scheduler API", () => {
  let app: Hono

  beforeEach(() => {
    app = new Hono()
    app.route("/api/schedule", SchedulerRoute)
  })

  describe("GET /api/schedule", () => {
    it("should return list of tasks", async () => {
      const res = await app.request("/api/schedule")
      expect(res.status).toBe(200)
      const data = await res.json()
      expect(Array.isArray(data)).toBe(true)
    })
  })

  describe("POST /api/schedule", () => {
    it("should create a new task", async () => {
      const taskData = {
        schedule: "0 8 * * *",
        prompt: "Get daily news report",
        metadata: { title: "Daily News" },
      }

      const res = await app.request("/api/schedule", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(taskData),
      })

      expect(res.status).toBe(201)
      const data = await res.json()
      expect(data).toHaveProperty("id")
      expect(data.prompt).toBe("Get daily news report")
      expect(data.schedule.cron).toBe("0 8 * * *")
    })

    it("should return 400 for invalid data", async () => {
      const res = await app.request("/api/schedule", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({}),
      })

      expect(res.status).toBe(400)
    })
  })

  describe("DELETE /api/schedule/:id", () => {
    it("should return 404 for non-existent task", async () => {
      const taskId = "non-existent-task"
      const res = await app.request(`/api/schedule/${taskId}`, {
        method: "DELETE",
      })

      expect(res.status).toBe(404)
    })
  })

  describe("GET /api/schedule/:id/result", () => {
    it("should return 404 for non-existent result", async () => {
      const taskId = "non-existent-task"
      const res = await app.request(`/api/schedule/${taskId}/result`)

      expect(res.status).toBe(404)
    })
  })
})