import { Component, Show } from "solid-js"
import { Card } from "@opencode-ai/ui/card"
import { Button } from "@opencode-ai/ui/button"
import { Icon } from "@opencode-ai/ui/icon"

interface SkillCardProps {
    id: string
    name: string
    emoji?: string
    image?: string
    description: string
    selected?: boolean
    onSelect?: () => void
    onStart?: () => void
}

export const SkillCard: Component<SkillCardProps> = (props) => {
    return (
        <Card
            class="flex flex-col h-full bg-surface-base border border-border-weak rounded-xl transition-all duration-200 hover:-translate-y-1 hover:shadow-lg cursor-pointer group relative overflow-hidden"
            onClick={props.onSelect}
        >
            {/* Image or Emoji Header */}
            <div class="aspect-square w-full bg-surface-highlight overflow-hidden relative">
                <Show
                    when={props.image}
                    fallback={
                        <div class="w-full h-full flex items-center justify-center text-48-regular group-hover:scale-110 transition-transform duration-300">
                            {props.emoji}
                        </div>
                    }
                >
                    <img
                        src={props.image}
                        alt={props.name}
                        class="w-full h-full object-contain p-4 group-hover:scale-105 transition-transform duration-500"
                    />
                </Show>

                {/* Overlay gradient for text readability if needed, or status badge */}
            </div>

            <div class="p-5 flex flex-col flex-1">
                {/* Title */}
                <div class="mb-2">
                    <h3 class="text-16-semibold text-text-strong leading-tight group-hover:text-text-brand transition-colors">
                        {props.name}
                    </h3>
                </div>

                {/* Description */}
                <p class="text-14-regular text-text-weak line-clamp-2 mb-4 flex-1 leading-relaxed">
                    {props.description}
                </p>

                {/* Actions */}
                <div class="flex justify-end gap-2 mt-auto pt-4 border-t border-border-weak opacity-0 translate-y-2 group-hover:opacity-100 group-hover:translate-y-0 transition-all duration-300">
                    <Button
                        size="small"
                        variant="ghost"
                        onClick={(e) => {
                            e.stopPropagation()
                            props.onSelect?.()
                        }}
                    >
                        Details
                    </Button>
                    <Button
                        size="small"
                        variant="primary"
                        onClick={(e) => {
                            e.stopPropagation()
                            props.onStart?.()
                        }}
                    >
                        <Icon name="play" size="small" class="mr-1.5" />
                        Start
                    </Button>
                </div>
            </div>
        </Card>
    )
}
