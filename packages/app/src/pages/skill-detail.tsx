/**
 * Skill Detail Page
 *
 * Shows detailed information about a skill and allows starting it.
 */

import { For, Show, createSignal, onMount } from "solid-js"
import { useParams, useNavigate } from "@solidjs/router"
import { Button } from "@opencode-ai/ui/button"
import { Icon } from "@opencode-ai/ui/icon"
import { ThinkingFlow, type ThinkingStep } from "@/components/ThinkingFlow"
import { ArtifactsPanel, type Artifact } from "@/components/ArtifactsPanel"
import { useSkill } from "@/context/skill"

export default function SkillDetailPage() {
  const params = useParams()
  const navigate = useNavigate()
  const { skills } = useSkill()

  const [skillId, setSkillId] = createSignal(params.name ?? "")
  const [running, setRunning] = createSignal(false)
  const [thinkingSteps, setThinkingSteps] = createSignal<ThinkingStep[]>([])
  const [artifacts, setArtifacts] = createSignal<Artifact[]>([])

  const skill = () => skills.find((s) => s.id === skillId() || s.name === skillId())

  async function startSkill() {
    if (running()) return
    setRunning(true)

    try {
      const response = await fetch(`/skill/${skillId()}/start`, {
        method: "POST",
        body: JSON.stringify({}),
      })

      if (response.ok) {
        const data = await response.json()
        if (data.sessionId) {
          navigate(`/session/${data.sessionId}`)
        }
      } else {
        console.error("Failed to start skill")
      }
    } catch (e) {
      console.error(e)
    } finally {
      setRunning(false)
    }
  }

  return (
    <div class="h-full flex flex-col overflow-hidden bg-background-base">
      {/* Header */}
      <header class="flex items-center justify-between px-6 py-4 border-b border-border-weak">
        <div class="flex items-center gap-3">
          <Button size="normal" variant="ghost" icon="arrow-left" onClick={() => navigate("/skills")} />
          <div class="text-24">{skill()?.emoji || "🧩"}</div>
          <div>
            <div class="text-16-semibold text-text-strong">{skill()?.name}</div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main class="flex-1 overflow-auto">
        <div class="max-w-4xl mx-auto px-6 py-8">
          <Show when={skill()}>
            {(s) => (
              <>
                {/* Description */}
                <section class="mb-8">
                  <h1 class="text-24-semibold text-text-strong mb-3">{s().name}</h1>
                  <p class="text-14-regular text-text-weak mb-4">{s().description}</p>
                </section>

                {/* Action */}
                <section class="mb-8">
                  <Button size="large" variant="primary" icon="enter" onClick={startSkill} disabled={running()}>
                    {running() ? "执行中..." : "开始使用"}
                  </Button>
                </section>
              </>
            )}
          </Show>

          {/* Not Found */}
          <Show when={!skill()}>
            <div class="flex flex-col items-center justify-center py-16 text-text-weak">
              <Icon name="circle-ban-sign" size="large" />
              <div class="text-14-medium mt-3">技能未找到</div>
              <Button class="mt-4" variant="ghost" icon="arrow-left" onClick={() => navigate("/skills")}>
                返回技能库
              </Button>
            </div>
          </Show>
        </div>
      </main>
    </div>
  )
}
