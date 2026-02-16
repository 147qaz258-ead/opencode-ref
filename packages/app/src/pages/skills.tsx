/**
 * Skills Page
 *
 * Displays all available skills with search and filtering.
 */

import { For, Show, createSignal, createMemo, createEffect } from "solid-js"
import { Button } from "@opencode-ai/ui/button"
import { Icon } from "@opencode-ai/ui/icon"
import { useNavigate } from "@solidjs/router"
import { SkillCapsule } from "@/components/SkillCapsule"
import { useSkill } from "@/context/skill"

export default function SkillsPage() {
  const navigate = useNavigate()
  const { skills, loading } = useSkill()
  const [searchQuery, setSearchQuery] = createSignal("")
  const [selectedSkill, setSelectedSkill] = createSignal<string | null>(null)


  // Filter skills by search query only
  const filteredSkills = createMemo(() => {
    const result = skills.filter((skill) => {
      const matchesSearch =
        skill.name.toLowerCase().includes(searchQuery().toLowerCase()) ||
        skill.description.toLowerCase().includes(searchQuery().toLowerCase())
      return matchesSearch
    })
    return result
  })

  function handleSkillSelect(skillId: string) {
    setSelectedSkill(skillId)
  }

  function handleSkillStart(skillId: string) {
    navigate(`/skills/${skillId}`)
  }

  return (
    <div class="h-full flex flex-col overflow-hidden bg-background-base">
      {/* Header */}
      <header class="flex items-center justify-between px-6 py-4 border-b border-border-weak">
        <div class="flex items-center gap-3">
          <Button size="normal" variant="ghost" icon="arrow-left" onClick={() => navigate("/")} />
          <div class="text-16-semibold text-text-strong">技能库</div>
        </div>
        <div class="flex items-center gap-3">
          {/* Search */}
          <div class="relative">
            <Icon
              name="magnifying-glass"
              size="normal"
              class="absolute left-3 top-1/2 -translate-y-1/2 text-text-weak"
            />
            <input
              type="text"
              placeholder="搜索技能..."
              value={searchQuery()}
              onInput={(e) => setSearchQuery(e.currentTarget.value)}
              class="pl-9 pr-4 py-2 bg-surface-weak border border-border-weak rounded text-14-regular text-text-strong placeholder-text-text-weak focus:outline-none focus:border-border-hover w-64"
            />
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main class="flex-1 overflow-auto">
        <div class="max-w-6xl mx-auto px-6 py-8">
          {/* Skills Grid */}
          <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            <For each={filteredSkills()}>
              {(skill) => (
                <SkillCapsule
                  {...skill}
                  emoji={skill.emoji || "🧩"}
                  selected={selectedSkill() === skill.id}
                  onSelect={() => handleSkillSelect(skill.id)}
                  onStart={() => handleSkillStart(skill.id)}
                />
              )}
            </For>
          </div>

          {/* Empty State */}
          <Show when={filteredSkills().length === 0}>
            <div class="flex flex-col items-center justify-center py-16 text-text-weak">
              <Icon name="magnifying-glass" size="large" />
              <div class="text-14-medium mt-3">未找到匹配的技能</div>
              <div class="text-12-regular">尝试调整搜索关键词或选择其他分类</div>
            </div>
          </Show>
        </div>
      </main>
    </div>
  )
}
