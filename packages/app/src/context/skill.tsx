/**
 * Skill Context and State Management
 *
 * Manages skill selection, loading, and execution state across the application.
 */

import { createContext, createSignal, createEffect, onMount, useContext, ParentComponent } from "solid-js"

export interface Skill {
  /** Skill ID */
  id: string
  /** Skill name */
  name: string
  /** Skill emoji/icon */
  emoji: string
  /** Skill image */
  image?: string
  /** Skill description */
  description: string
}

export interface SkillContextState {
  /** Available skills */
  skills: Skill[]
  /** Currently selected skill ID */
  selectedSkillId: string | null
  /** Selected skill object */
  selectedSkill: Skill | null
  /** Loading state */
  loading: boolean
  /** Error state */
  error: string | null
}

interface SkillContextValue extends SkillContextState {
  /** Load skills from server */
  loadSkills: () => Promise<void>
  /** Select a skill */
  selectSkill: (skillId: string) => void
  /** Clear selection */
  clearSelection: () => void
  /** Start skill session */
  startSkill: (skillId: string, projectId: string) => Promise<void>
  /** Refresh skills */
  refreshSkills: () => Promise<void>
}

const SkillContext = createContext<SkillContextValue>()

export function useSkill() {
  const context = useContext(SkillContext)
  if (!context) {
    throw new Error("useSkill must be used within a SkillProvider")
  }
  return context
}

export const SkillProvider: ParentComponent = (props) => {
  const [skills, setSkills] = createSignal<Skill[]>([])
  const [selectedSkillId, setSelectedSkillId] = createSignal<string | null>(null)
  const [loading, setLoading] = createSignal(false)
  const [error, setError] = createSignal<string | null>(null)

  // Derived signals
  const selectedSkill = () => {
    const id = selectedSkillId()
    return skills().find((s) => s.id === id) ?? null
  }

  // Load skills from server (No hardcoded sample data)
  const loadSkills = async () => {
    setLoading(true)
    setError(null)

    try {
      const response = await fetch("/skill")
      if (response.ok) {
        const data = await response.json()

        if (data && Array.isArray(data.skills)) {
          const remoteSkills: Skill[] = data.skills.map((s: any) => {
            // Determine emoji: from backend or default
            const emoji = s.emoji || "🧩"

            // Determine image:
            // 1. If backend provides one, use it (future proofing)
            // 2. Use the dynamic icon endpoint served by the backend
            // 3. Fallback handled by SkillCard component via onerror
            const image = s.image || `/skill/${s.id || s.name}/icon`

            return {
              id: s.id || s.name,
              name: s.name,
              description: s.description || "No description available",
              image: image,
              emoji: emoji,
            }
          })

          setSkills(remoteSkills)
        }
      } else {
        console.warn("Failed to fetch skills:", response.statusText)
        // Don't use fallback samples, just empty or error state as requested
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : "Failed to load skills"
      setError(errorMsg)
      console.error("Failed to load skills:", err)
    } finally {
      setLoading(false)
    }
  }

  // Refresh skills
  const refreshSkills = async () => {
    await loadSkills()
  }

  // Select a skill
  const selectSkill = (skillId: string) => {
    setSelectedSkillId(skillId)
  }

  // Clear selection
  const clearSelection = () => {
    setSelectedSkillId(null)
  }

  // Start skill session
  const startSkill = async (skillId: string, projectId: string) => {
    setLoading(true)
    setError(null)

    try {
      const response = await fetch(`/skill/${skillId}/start`, {
        method: "POST",
        body: JSON.stringify({ projectDir: projectId }),
      })

      if (response.ok) {
        const data = await response.json()
        // TODO: Handle navigation or callback based on response
        return
      }

      console.warn("Failed to start skill via API")
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : "Failed to start skill"
      setError(errorMsg)
      console.error("Failed to start skill:", err)
    } finally {
      setLoading(false)
    }
  }

  // Auto-load skills on mount (only once)
  onMount(() => {
    loadSkills()
  })

  // Periodically refresh to catch new skills (flywheel effect)
  // Note: Reduced frequency from 5s to 60s to reduce API load
  createEffect(() => {
    const interval = setInterval(() => {
      if (!loading()) loadSkills()
    }, 60000) // Poll every 60s

    return () => clearInterval(interval)
  })

  const contextValue: SkillContextValue = {
    get skills() {
      return skills()
    },
    get selectedSkillId() {
      return selectedSkillId()
    },
    get selectedSkill() {
      return selectedSkill()
    },
    get loading() {
      return loading()
    },
    get error() {
      return error()
    },
    loadSkills,
    selectSkill,
    clearSelection,
    startSkill,
    refreshSkills,
  }

  return <SkillContext.Provider value={contextValue}>{props.children}</SkillContext.Provider>
}
