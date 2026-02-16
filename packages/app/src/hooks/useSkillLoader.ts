import { createSignal } from "solid-js"

export interface SkillLoadOptions {
  sessionId: string
  skillName: string
}

export interface SkillLoadResult {
  success: boolean
  message?: string
  error?: string
}

export function useSkillLoader() {
  const [loading, setLoading] = createSignal(false)
  const [error, setError] = createSignal<string | null>(null)

  /**
   * Load a skill by sending a message that triggers the skill tool
   */
  async function loadSkill(options: SkillLoadOptions): Promise<SkillLoadResult> {
    const { sessionId, skillName } = options
    setLoading(true)
    setError(null)

    try {
      const response = await fetch(`/api/session/${sessionId}/message`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          parts: [{ type: "text", text: `@${skillName}` }],
        }),
      })

      if (!response.ok) {
        throw new Error(`Failed to load skill: ${response.statusText}`)
      }

      const data = await response.json()
      return {
        success: true,
        message: `Skill "${skillName}" loaded successfully`,
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err)
      setError(errorMsg)
      return {
        success: false,
        error: errorMsg,
      }
    } finally {
      setLoading(false)
    }
  }

  return {
    loadSkill,
    loading,
    error,
  }
}
