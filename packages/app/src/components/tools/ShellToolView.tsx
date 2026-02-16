import { For, Show } from "solid-js"
import { Button } from "@opencode-ai/ui/button"

interface ShellToolViewProps {
  output: () => string[]
  onClear: () => void
}

export function ShellToolView(props: ShellToolViewProps) {
  return (
    <div class="h-full flex flex-col font-mono text-sm">
      {/* Toolbar */}
      <div class="flex items-center justify-between p-2 border-b">
        <span class="text-muted-foreground">Shell Output</span>
        <Button variant="ghost" size="small" onClick={props.onClear}>
          Clear
        </Button>
      </div>

      {/* Output area */}
      <div class="flex-1 overflow-auto">
        <div class="p-2 whitespace-pre-wrap break-words">
          <Show when={props.output().length === 0}>
            <div class="text-muted-foreground italic">No shell output yet...</div>
          </Show>
          <For each={props.output()}>
            {(line) => (
              <div class="hover:bg-muted/50 px-1 rounded">
                {line}
              </div>
            )}
          </For>
        </div>
      </div>
    </div>
  )
}
