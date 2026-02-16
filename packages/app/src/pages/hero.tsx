/**
 * Hero Page - Lovart Style
 *
 * Modern landing page with centered input, quick actions, and visual skill grid.
 */

import { createSignal, For } from "solid-js"
import { Button } from "@opencode-ai/ui/button"
import { Logo } from "@opencode-ai/ui/logo"
import { Icon } from "@opencode-ai/ui/icon"
import { useNavigate, A } from "@solidjs/router"
import { useDialog } from "@opencode-ai/ui/context/dialog"
import { DialogSelectServer } from "@/components/dialog-select-server"
import { useServer } from "@/context/server"
import { useGlobalSDK } from "@/context/global-sdk"
import { SkillCard } from "@/components/SkillCard"
import { PromptInput } from "@/components/prompt-input"
import { PromptProvider } from "@/context/prompt"
import { FileProvider } from "@/context/file"
import { TerminalProvider } from "@/context/terminal"
import { SDKProvider } from "@/context/sdk"
import { SyncProvider } from "@/context/sync"
import { LocalProvider } from "@/context/local"
import { useSkill } from "@/context/skill"


export default function Hero() {
  const dialog = useDialog()
  const navigate = useNavigate()
  const server = useServer()
  const sdk = useGlobalSDK()
  const { skills } = useSkill()

  // Selected skill
  const [selectedSkill, setSelectedSkill] = createSignal<string | null>(null)

  // Mounted skill state
  const [mountedSkill, setMountedSkill] = createSignal<string | null>(null)

  function handleSkillSelect(skillId: string) {
    setSelectedSkill(skillId === selectedSkill() ? null : skillId)
  }

  function handleSkillStart(skillId: string) {
    setMountedSkill(skillId)
  }

  function handleRemoveSkill() {
    setMountedSkill(null)
  }

  const suggestions = [
    { icon: "monitor", label: "Generate Slides", desc: "Create minimal slides" },
    { icon: "file-text", label: "Write Docs", desc: "Project documentation" },
    { icon: "file-markdown", label: "Storybook", desc: "Create interactive stories" },
    { icon: "magnifying-glass", label: "Research", desc: "Batch analysis" },
    { icon: "workflow", label: "Analyze Data", desc: "Insights from files" },
  ]

  return (
    <SDKProvider directory="hero">
      <SyncProvider>
        <TerminalProvider>
          <FileProvider>
            <PromptProvider>
              <LocalProvider>
                <div class="h-full w-full flex flex-col bg-background-base overflow-hidden relative">
                   {/* Ambient Background */}
                   <div class="absolute inset-0 pointer-events-none overflow-hidden">
                      <div class="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] bg-blue-500/5 blur-[120px] rounded-full mix-blend-multiply opacity-70 animate-blob"></div>
                      <div class="absolute top-[-20%] right-[-10%] w-[50%] h-[50%] bg-purple-500/5 blur-[120px] rounded-full mix-blend-multiply opacity-70 animate-blob animation-delay-2000"></div>
                   </div>

                  {/* Header */}
                  <header class="flex items-center justify-between px-8 py-6 flex-shrink-0 z-10">
                    <div class="flex items-center gap-3">
                       <Logo class="h-6" />
                    </div>
                    <div class="flex items-center gap-4">
                      {/* User Avatar */}
                      <div class="w-8 h-8 rounded-full bg-surface-highlight flex items-center justify-center text-text-weak ring-1 ring-border-weak">
                        <Icon name="brain" size="small" />
                      </div>
                    </div>
                  </header>

                  {/* Main Content - Full Width */}
                  <main class="flex-1 overflow-y-auto w-full z-10">
                    <div class="w-full px-6 md:px-12 flex flex-col items-center pt-16 md:pt-24 pb-20 max-w-7xl mx-auto">

                      {/* Hero Title */}
                      <h1 class="text-40-regular md:text-56-regular text-text-strong mb-12 tracking-tight text-center bg-gradient-to-b from-text-strong to-text-subtle bg-clip-text text-transparent pb-1">
                        What vision can I bring to life for you today?
                      </h1>

                      {/* Large Input Box */}
                      <div class="w-full max-w-3xl mb-12 relative group">
                        <div class="absolute -inset-1 bg-gradient-to-r from-blue-500/20 to-purple-500/20 rounded-3xl blur opacity-20 group-hover:opacity-40 transition duration-1000 group-hover:duration-200"></div>
                        <div class="relative transform transition-all duration-300 shadow-xl group-hover:shadow-2xl rounded-2xl border border-border-weak bg-surface-base/60 backdrop-blur-xl min-h-[120px] flex items-center p-2">
                          <PromptInput
                            class="w-full min-h-[100px]"
                            mountedSkill={mountedSkill()}
                            onSkillRemove={handleRemoveSkill}
                            submitLabel="Build"
                            submitIcon="play"
                          />
                        </div>
                      </div>

                      {/* Suggestion Cards */}
                      <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4 mb-24 w-full max-w-5xl px-4">
                        <For each={suggestions}>
                          {(item) => (
                            <button class="flex flex-col items-start p-4 rounded-xl border border-border-weak bg-surface-base/50 hover:bg-surface-raised-base hover:border-border-base hover:shadow-md transition-all duration-300 group text-left">
                              <div class="p-2 rounded-lg bg-surface-highlight text-text-brand mb-3 group-hover:scale-110 transition-transform">
                                <Icon name={item.icon as any} size="large" />
                              </div>
                              <span class="text-14-semibold text-text-strong mb-1">{item.label}</span>
                              <span class="text-12-regular text-text-weak">{item.desc}</span>
                            </button>
                          )}
                        </For>
                      </div>

                      {/* Skills Section */}
                      <div class="w-full">
                        {/* Tabs */}
                        <div class="flex items-center gap-8 border-b border-border-weak mb-8 px-2 overflow-x-auto no-scrollbar mask-linear-x">
                          <button class="pb-3 border-b-2 border-text-brand text-text-strong text-14-semibold whitespace-nowrap">All Templates</button>
                          <button class="pb-3 border-b-2 border-transparent text-text-weak hover:text-text-strong text-14-medium transition-colors whitespace-nowrap">2025 Review ✨</button>
                          <button class="pb-3 border-b-2 border-transparent text-text-weak hover:text-text-strong text-14-medium transition-colors whitespace-nowrap">General</button>
                          <button class="pb-3 border-b-2 border-transparent text-text-weak hover:text-text-strong text-14-medium transition-colors whitespace-nowrap">Growth</button>
                          <button class="pb-3 border-b-2 border-transparent text-text-weak hover:text-text-strong text-14-medium transition-colors whitespace-nowrap">Research</button>
                          <button class="pb-3 border-b-2 border-transparent text-text-weak hover:text-text-strong text-14-medium transition-colors whitespace-nowrap">Marketing</button>
                          <button class="pb-3 border-b-2 border-transparent text-text-weak hover:text-text-strong text-14-medium transition-colors whitespace-nowrap">Learning</button>
                          <button class="pb-3 border-b-2 border-transparent text-text-weak hover:text-text-strong text-14-medium transition-colors whitespace-nowrap">Career</button>
                        </div>

                        {/* Skills Grid */}
                        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-6">
                          <For each={skills}>
                            {(skill) => (
                              <div class="h-auto">
                                <SkillCard
                                  id={skill.id}
                                  name={skill.name}
                                  image={skill.image}
                                  emoji={skill.emoji}
                                  description={skill.description}
                                  selected={selectedSkill() === skill.id}
                                  onSelect={() => handleSkillSelect(skill.id)}
                                  onStart={() => handleSkillStart(skill.id)}
                                />
                              </div>
                            )}
                          </For>
                        </div>
                      </div>

                    </div>
                  </main>
                </div>
              </LocalProvider>
            </PromptProvider>
          </FileProvider>
        </TerminalProvider>
      </SyncProvider>
    </SDKProvider>
  )
}