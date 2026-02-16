import { For, Show } from "solid-js"

interface BrowserToolViewProps {
  events: () => Array<{ action: string; timestamp: number; url?: string }>
}

export function BrowserToolView(props: BrowserToolViewProps) {
  const formatTime = (timestamp: number) => {
    return new Date(timestamp).toLocaleTimeString()
  }

  const actionIcon = (action: string) => {
    switch (action) {
      case "navigated": return "🌐"
      case "clicked": return "👆"
      case "input": return "⌨️"
      case "screenshot": return "📸"
      case "scrolled": return "📜"
      case "error": return "❌"
      default: return "•"
    }
  }

  return (
    <div class="h-full flex flex-col">
      <div class="p-2 border-b">
        <span class="text-muted-foreground text-sm">Browser Events</span>
      </div>

      <div class="flex-1 overflow-auto">
        <div class="p-2 space-y-2">
          <Show when={props.events().length === 0}>
            <div class="text-muted-foreground italic text-sm">No browser events yet...</div>
          </Show>

          <For each={props.events()}>
            {(event) => (
              <div class="flex items-start gap-2 p-2 rounded bg-muted/30">
                <span class="text-lg">{actionIcon(event.action)}</span>
                <div class="flex-1 min-w-0">
                  <div class="text-sm font-medium capitalize">{event.action}</div>
                  <Show when={event.url}>
                    <div class="text-xs text-muted-foreground truncate">{event.url}</div>
                  </Show>
                </div>
                <div class="text-xs text-muted-foreground">{formatTime(event.timestamp)}</div>
              </div>
            )}
          </For>
        </div>
      </div>
    </div>
  )
}
