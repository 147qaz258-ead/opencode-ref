/**
 * Skill Capsule Component
 *
 * Displays a skill as a clickable card with emoji, name, and description.
 * Supports selection state and quick-start action.
 */

import { Show } from "solid-js"
import { Button } from "@opencode-ai/ui/button"
import { Icon } from "@opencode-ai/ui/icon"

export interface SkillCapsuleProps {
  /** Skill ID */
  id: string
  /** Skill name */
  name: string
  /** Skill emoji/icon */
  emoji: string
  /** Skill description */
  description: string
  /** Whether skill is selected */
  selected?: boolean
  /** Selection callback */
  onSelect?: () => void
  /** Start callback */
  onStart?: () => void
}

export function SkillCapsule(props: SkillCapsuleProps) {
  return (
    <div
      classList={{
        "relative flex flex-col gap-3 p-4 rounded-lg border-2 transition-all cursor-pointer hover:shadow-md": true,
        "border-surface-weak bg-surface-weak": !props.selected,
        "border-primary-base bg-primary-weak": props.selected,
      }}
      onClick={props.onSelect}
    >
      {/* Header */}
      <div class="flex items-start justify-between">
        <div class="flex items-center gap-2">
          <div class="text-24">{props.emoji}</div>
          <div>
            <div class="text-14-semibold text-text-strong">{props.name}</div>
          </div>
        </div>
        <Show when={props.selected}>
          <div class="text-primary-base">
            <Icon name="check-circle" size="normal" />
          </div>
        </Show>
      </div>

      {/* Description */}
      <div class="text-12-regular text-text-weak flex-1">
        {props.description}
      </div>

      {/* Action */}
      <Show when={props.selected}>
        <div class="mt-auto">
          <Button
            size="normal"
            variant="primary"
            class="w-full"
            onClick={(e) => {
              e.stopPropagation()
              props.onStart?.()
            }}
          >
            <Icon name="play" size="small" />
            开始使用
          </Button>
        </div>
      </Show>
    </div>
  )
}
