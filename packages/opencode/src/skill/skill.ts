import z from "zod"
import { Instance } from "../project/instance"
import { NamedError } from "@opencode-ai/util/error"
import { ConfigMarkdown } from "../config/markdown"
import { Log } from "../util/log"
import { exists } from "fs/promises"
import { Filesystem } from "../util/filesystem"
import path from "path"

export namespace Skill {
  const log = Log.create({ service: "skill" })
  export const Info = z.object({
    name: z.string(),
    description: z.string(),
    location: z.string(),
  })
  export type Info = z.infer<typeof Info>

  export const InvalidError = NamedError.create(
    "SkillInvalidError",
    z.object({
      path: z.string(),
      message: z.string().optional(),
      issues: z.custom<z.core.$ZodIssue[]>().optional(),
    }),
  )

  export const NameMismatchError = NamedError.create(
    "SkillNameMismatchError",
    z.object({
      path: z.string(),
      expected: z.string(),
      actual: z.string(),
    }),
  )

  export const state = Instance.state(async () => {
    const skills: Record<string, Info> = {}

    log.info("skill scan starting", {
      projectDir: Instance.directory,
      mode: "project-only"
    })

    const addSkill = async (match: string) => {
      const md = await ConfigMarkdown.parse(match)
      if (!md) {
        return
      }

      const parsed = Info.pick({ name: true, description: true }).safeParse(md.data)
      if (!parsed.success) return

      // Warn on duplicate skill names
      if (skills[parsed.data.name]) {
        log.warn("duplicate skill name", {
          name: parsed.data.name,
          existing: skills[parsed.data.name].location,
          duplicate: match,
        })
      }

      skills[parsed.data.name] = {
        name: parsed.data.name,
        description: parsed.data.description,
        location: match,
      }
    }

    // === 扫描项目技能目录 ===
    // 递归向上搜索 .opencode/skills
    // 优先使用环境变量 OPENCODE_SKILLS_DIR（沙盒模式），否则使用项目目录
    if (process.env.OPENCODE_SKILLS_DIR) {
      if (await exists(process.env.OPENCODE_SKILLS_DIR)) {
        await scanDirectory(process.env.OPENCODE_SKILLS_DIR)
      } else {
         log.warn("OPENCODE_SKILLS_DIR defined but does not exist", { path: process.env.OPENCODE_SKILLS_DIR })
      }
    } else {
      // 这里的逻辑是：从当前目录向上查找 .opencode/skills 目录
      log.info("Searching for skills using Filesystem.up", { start: process.cwd(), targets: [".opencode/skills"] })
      const skillDirs = await Array.fromAsync(
        Filesystem.up({
          targets: [".opencode/skills"],
          start: process.cwd(),
          // 不设置 stop，允许一直向上查找直到文件系统根目录
        })
      )

      log.info("Found skill directories", { dirs: skillDirs })

      for (const dir of skillDirs as string[]) {
        await scanDirectory(dir)
      }
    }

    async function scanDirectory(dir: string) {
      log.info("scanning skills directory", { path: dir })
      const glob = new Bun.Glob("*/SKILL.md")
      for await (const match of glob.scan({
        cwd: dir,
        absolute: true,
        onlyFiles: true,
        followSymlinks: true,
      })) {
        await addSkill(match)
      }
    }

    log.info("skills loaded", {
      count: Object.keys(skills).length,
      projectDir: Instance.directory,
      mode: "project-only",
      names: Object.keys(skills)
    })

    return skills
  })

  export async function get(name: string) {
    const skills = await state()
    return skills[name]
  }

  export async function all() {
    const skills = await state()
    return Object.values(skills)
  }
}