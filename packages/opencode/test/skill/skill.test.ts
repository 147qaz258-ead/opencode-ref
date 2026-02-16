import { describe, test, expect, beforeAll, afterAll } from "bun:test"
import path from "path"
import { mkdir, writeFile, rm } from "fs/promises"
import { Skill } from "@/skill/skill"
import { Instance } from "@/project/instance"

describe("Skill Module", () => {
  const testDir = path.join(process.cwd(), "test-tmp-skill")

  beforeAll(async () => {
    // 创建测试项目目录
    await mkdir(testDir, { recursive: true })

    // 创建测试技能
    const skillsDir = path.join(testDir, ".opencode", "skills")
    await mkdir(skillsDir, { recursive: true })

    const testSkillDir = path.join(skillsDir, "test-skill")
    await mkdir(testSkillDir, { recursive: true })

    await writeFile(
      path.join(testSkillDir, "SKILL.md"),
      `---
name: test-skill
description: Test skill description
---

# Test Skill

This is a test skill.`
    )
  })

  afterAll(async () => {
    // 清理测试目录
    await rm(testDir, { recursive: true, force: true })
  })

  test("should load skills from project .opencode/skills directory", async () => {
    await Instance.provide({
      directory: testDir,
      fn: async () => {
        const skills = await Skill.all()

        expect(skills.length).toBeGreaterThan(0)

        const testSkill = skills.find(s => s.name === "test-skill")
        expect(testSkill).toBeDefined()
        expect(testSkill?.description).toBe("Test skill description")
      },
    })
  })

  test("should get skill by name", async () => {
    await Instance.provide({
      directory: testDir,
      fn: async () => {
        const skill = await Skill.get("test-skill")

        expect(skill).toBeDefined()
        expect(skill?.name).toBe("test-skill")
      },
    })
  })

  test("should return undefined for non-existent skill", async () => {
    await Instance.provide({
      directory: testDir,
      fn: async () => {
        const skill = await Skill.get("non-existent")
        expect(skill).toBeUndefined()
      },
    })
  })
})
