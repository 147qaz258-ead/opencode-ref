/**
 * Artifacts Panel Component
 *
 * Displays generated artifacts (PDFs, images, code, etc.) from AI responses.
 * Supports preview, download, and expand/collapse functionality.
 */

import { For, Show, createMemo, createSignal } from "solid-js"
import { Icon } from "@opencode-ai/ui/icon"
import { Button } from "@opencode-ai/ui/button"

export type ArtifactType = "pdf" | "image" | "code" | "text" | "json" | "markdown"

export interface Artifact {
  /** Artifact ID */
  id: string
  /** Artifact type */
  type: ArtifactType
  /** Artifact title */
  title: string
  /** Artifact URL or content */
  content: string
  /** File size (bytes) */
  size?: number
  /** Creation timestamp */
  createdAt: number
  /** Metadata */
  metadata?: Record<string, any>
}

export interface ArtifactsPanelProps {
  /** Artifacts to display */
  artifacts: Artifact[]
  /** Collapsed state */
  collapsed?: boolean
  /** Toggle callback */
  onToggle?: () => void
  /** Download callback */
  onDownload?: (artifact: Artifact) => void
  /** Preview callback */
  onPreview?: (artifact: Artifact) => void
}

export function ArtifactsPanel(props: ArtifactsPanelProps) {
  const [collapsed, setCollapsed] = createSignal(props.collapsed ?? false)
  const [previewArtifact, setPreviewArtifact] = createSignal<Artifact | null>(null)

  const toggleCollapse = () => {
    setCollapsed(!collapsed())
    props.onToggle?.()
  }

  const getArtifactIcon = (type: ArtifactType) => {
    switch (type) {
      case "pdf":
        return "file-pdf"
      case "image":
        return "file-image"
      case "code":
        return "file-code"
      case "text":
        return "file-text"
      case "json":
        return "file-json"
      case "markdown":
        return "file-markdown"
    }
  }

  const getArtifactColor = (type: ArtifactType) => {
    switch (type) {
      case "pdf":
        return "text-icon-critical-base"
      case "image":
        return "text-icon-brand-base"
      case "code":
        return "text-icon-success-base"
      case "text":
        return "text-icon-weak-base"
      case "json":
        return "text-icon-warning-base"
      case "markdown":
        return "text-icon-info-base"
    }
  }

  const formatFileSize = (bytes?: number) => {
    if (!bytes) return ""
    if (bytes < 1024) return `${bytes}B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)}MB`
  }

  const handleDownload = (artifact: Artifact) => {
    props.onDownload?.(artifact)
    // Default download behavior
    if (artifact.content.startsWith("http")) {
      const a = document.createElement("a")
      a.href = artifact.content
      a.download = artifact.title
      a.click()
    }
  }

  const handlePreview = (artifact: Artifact) => {
    setPreviewArtifact(artifact)
    props.onPreview?.(artifact)
  }

  return (
    <div class="flex flex-col gap-2">
      {/* Header */}
      <div class="flex items-center justify-between px-3">
        <div class="flex items-center gap-2">
          <Icon name="artifact" size="normal" class="text-text-weak" />
          <div class="text-14-medium text-text-strong">生成产物</div>
          <div class="text-12-regular text-text-weak">
            {props.artifacts.length} 个文件
          </div>
        </div>
        <Button
          size="small"
          variant="ghost"
          icon={collapsed() ? "chevron-down" : "chevron-up"}
          onClick={toggleCollapse}
        >
          {collapsed() ? "展开" : "收起"}
        </Button>
      </div>

      {/* Artifacts List */}
      <Show when={!collapsed()}>
        <div class="flex flex-col gap-2">
          <For each={props.artifacts}>
            {(artifact) => (
              <div class="flex items-center gap-3 p-3 bg-surface-weak rounded border border-border-weak hover:border-border-hover transition-colors">
                {/* Icon */}
                <div class={getArtifactColor(artifact.type)}>
                  <Icon name={getArtifactIcon(artifact.type)} size="large" />
                </div>

                {/* Info */}
                <div class="flex-1 min-w-0">
                  <div class="text-14-medium text-text-strong truncate">{artifact.title}</div>
                  <div class="flex items-center gap-2 text-12-regular text-text-weak">
                    <span class="uppercase">{artifact.type}</span>
                    <Show when={artifact.size}>
                      <span>· {formatFileSize(artifact.size)}</span>
                    </Show>
                  </div>
                </div>

                {/* Actions */}
                <div class="flex items-center gap-1">
                  <Show when={artifact.type === "image" || artifact.type === "pdf"}>
                    <Button
                      size="small"
                      variant="ghost"
                      icon="eye"
                      onClick={() => handlePreview(artifact)}
                    >
                      预览
                    </Button>
                  </Show>
                  <Button
                    size="small"
                    variant="ghost"
                    icon="download"
                    onClick={() => handleDownload(artifact)}
                  >
                    下载
                  </Button>
                </div>
              </div>
            )}
          </For>

          {/* Empty State */}
          <Show when={props.artifacts.length === 0}>
            <div class="flex flex-col items-center justify-center py-8 text-text-weak">
              <Icon name="inbox" size="large" />
              <div class="text-14-regular mt-2">暂无生成产物</div>
            </div>
          </Show>
        </div>
      </Show>

      {/* Preview Modal */}
      <Show when={previewArtifact()}>
        {(artifact) => (
          <div class="fixed inset-0 flex items-center justify-center bg-black/50 z-50" onClick={() => setPreviewArtifact(null)}>
            <div
              class="max-w-4xl max-h-[80vh] overflow-auto bg-background-base rounded-lg shadow-xl m-4"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Preview Header */}
              <div class="flex items-center justify-between p-4 border-b border-border-weak">
                <div class="text-16-semibold text-text-strong">{artifact().title}</div>
                <Button
                  size="small"
                  variant="ghost"
                  icon="close"
                  onClick={() => setPreviewArtifact(null)}
                />
              </div>

              {/* Preview Content */}
              <div class="p-4">
                <Show when={artifact().type === "image"}>
                  <img src={artifact().content} alt={artifact().title} class="max-w-full h-auto" />
                </Show>
                <Show when={artifact().type === "code" || artifact().type === "text" || artifact().type === "json" || artifact().type === "markdown"}>
                  <pre class="text-12-regular text-text-strong whitespace-pre-wrap font-mono bg-surface-weak p-4 rounded overflow-auto max-h-[60vh]">
                    {artifact().content}
                  </pre>
                </Show>
                <Show when={artifact().type === "pdf"}>
                  <iframe src={artifact().content} class="w-full h-[60vh] rounded" />
                </Show>
              </div>
            </div>
          </div>
        )}
      </Show>
    </div>
  )
}

/**
 * Hook to manage artifacts from SSE events
 */
export function useArtifacts() {
  const [artifacts, setArtifacts] = createSignal<Artifact[]>([])

  const handleArtifact = (event: {
    artifact: {
      type: ArtifactType
      url: string
      metadata: Record<string, any>
    }
  }) => {
    const artifact: Artifact = {
      id: `${Date.now()}-${Math.random()}`,
      type: event.artifact.type,
      title: event.artifact.metadata.title ?? `Generated ${event.artifact.type}`,
      content: event.artifact.url,
      createdAt: Date.now(),
      metadata: event.artifact.metadata,
    }
    setArtifacts((prev) => [...prev, artifact])
  }

  const clearArtifacts = () => {
    setArtifacts([])
  }

  return {
    artifacts,
    handleArtifact,
    clearArtifacts,
  }
}
