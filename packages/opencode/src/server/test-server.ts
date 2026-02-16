import { Hono } from "hono"
import { SchedulerRoute } from "./scheduler"

const app = new Hono()
app.route("/api/schedule", SchedulerRoute)

export default app