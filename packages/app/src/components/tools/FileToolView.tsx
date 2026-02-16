import { For, Show } from "solid-js"

interface FileToolViewProps {
  changes: () => Array<{ path: string; action: string; timestamp: number }>
}

export function FileToolView(props: FileToolViewProps) {
  const actionColor = (action: string) => {
    switch (action) {
      case "created": return "text-green-500"
      case "modified": return "text-yellow-500"
      case "deleted": return "text-red-500"
      default: return "text-muted-foreground"
    }
  }

  return (
    <div class="h-full flex flex-col">
      <div class="p-2 border-b">
        <span class="text-muted-foreground text-sm">File Changes</span>
      </div>

      <div class="flex-1 overflow-auto">
        <div class="p-2 space-y-1">
          <Show when={props.changes().length === 0}>
            <div class="text-muted-foreground italic text-sm">No file changes yet...</div>
          </Show>

          <For each={props.changes()}>
            {(change) => (
              <div class="flex items-center gap-2 p-2 rounded bg-muted/30 text-sm">
                <span class={`capitalize font-medium ${actionColor(change.action)}`}>
                  {change.action}
                </span>
                <span class="flex-1 truncate text-muted-foreground">{change.path}</span>
              </div>
            )}
          </For>
        </div>
      </div>
    </div>
  )
}
