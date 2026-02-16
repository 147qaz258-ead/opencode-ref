import { createMemo, Show } from "solid-js"
import { Button } from "@opencode-ai/ui/button"
import { useDialog } from "@opencode-ai/ui/context/dialog"
import { useSync } from "@/context/sync"
import { DialogSelectMcp } from "@/components/dialog-select-mcp"

export function SessionMcpIndicator() {
  const sync = useSync()
  const dialog = useDialog()

  // Safely get MCP data with comprehensive fallbacks
  const safeMcpData = createMemo(() => {
    try {
      const data = sync?.data
      if (!data) {
        return {}
      }
      const mcp = data.mcp
      if (!mcp) {
        return {}
      }
      if (typeof mcp !== "object" || Array.isArray(mcp)) {
        return {}
      }
      return mcp
    } catch (error) {
      return {}
    }
  })

  // Compute stats with guaranteed return value
  const mcpStats = createMemo(() => {
    try {
      const mcp = safeMcpData()
      const entries = Object.entries(mcp)
      const enabled = entries.filter(([, status]) => status?.status === "connected").length
      const failed = entries.some(([, status]) => status?.status === "failed")
      const total = entries.length
      const stats = { enabled, failed, total }
      return stats
    } catch (error) {
      return { enabled: 0, failed: false, total: 0 }
    }
  })

  const showIndicator = createMemo(() => {
    const stats = mcpStats()
    const shouldShow = (stats?.total ?? 0) > 0
    return shouldShow
  })

  return (
    <Show when={showIndicator()}>
      <Button variant="ghost" onClick={() => dialog.show(() => <DialogSelectMcp />)}>
        <div
          classList={{
            "size-1.5 rounded-full": true,
            "bg-icon-critical-base": mcpStats()?.failed ?? false,
            "bg-icon-success-base": !(mcpStats()?.failed ?? false) && (mcpStats()?.enabled ?? 0) > 0,
          }}
        />
        <span class="text-12-regular text-text-weak">{mcpStats()?.enabled ?? 0} MCP</span>
      </Button>
    </Show>
  )
}
