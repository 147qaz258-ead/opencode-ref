import path from "path"
import z from "zod"
import { Tool } from "./tool"
import { Skill } from "../skill"
import { Instance } from "../project/instance"

/**
 * Convert host path to container path
 * Handles both host mode and sandbox mode
 */
function getContainerSkillPath(hostSkillLocation: string): string {
  // Extract skill name from path
  // Example: D:\project\.opencode\skills\comic-gen\SKILL.md
  // Normalize path separators first
  const normalizedPath = hostSkillLocation.replace(/\\/g, '/')
  const parts = normalizedPath.split('/')
  const skillName = parts[parts.length - 2] // Second to last part is skill name

  // Get the base skills directory in container
  // Priority: 
  // 1. OPENCODE_SKILLS_DIR env
  // 2. /skills (Explicit mount point for skills in clean containers)
  // 3. /workspace/.opencode/skills (Fallback for development/legacy mounts)
  const skillsBaseDir = process.env.OPENCODE_SKILLS_DIR || "/skills"

  // Return container path (use forward slashes for consistency)
  return `${skillsBaseDir}/${skillName}/SKILL.md`.replace(/\\/g, '/')
}

export const SkillTool = Tool.define("skill", async () => {
  const skills = await Skill.all()

  const description =
    skills.length === 0
      ? "Get the file path for a skill. No skills are currently available."
      : [
        "Get the file path for a skill to read its contents.",
        "Skills provide specialized knowledge and step-by-step guidance.",
        "After getting the path, use the read tool to examine the skill content.",
        "This allows you to load skills on-demand rather than pre-loading all content.",
        "<available_skills>",
        ...skills.flatMap((skill) => [
          `  <skill>`,
          `    <name>${skill.name}</name>`,
          `    <description>${skill.description}</description>`,
          `  </skill>`,
        ]),
        "</available_skills>",
      ].join(" ")

  return {
    description,
    parameters: z.object({
      name: z
        .string()
        .describe("The skill identifier from available_skills (e.g., 'ui-ux-pro-max' or 'comic-gen')"),
    }),
    async execute(params, ctx) {
      const skill = await Skill.get(params.name)

      if (!skill) {
        const available = await Skill.all().then((x) => x.map(s => s.name).join(", "))
        throw new Error(`Skill "${params.name}" not found. Available skills: ${available || "none"}`)
      }

      await ctx.ask({
        permission: "skill",
        patterns: [params.name],
        always: [params.name],
        metadata: {},
      })

      // Get container path for the skill file
      const containerPath = getContainerSkillPath(skill.location)

      // Return path instead of content - let AI read it on-demand
      const output = [
        `## Skill: ${skill.name}`,
        "",
        `**Description**: ${skill.description}`,
        "",
        `**File path**: ${containerPath}`,
        "",
        `To use this skill, read the file at the path above using the read tool.`,
        `Example: read("${containerPath}")`,
      ].join("\n")

      return {
        title: `Skill available: ${skill.name}`,
        output,
        metadata: {
          name: skill.name,
          path: containerPath,
        },
      }
    },
  }
})
