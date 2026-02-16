/**
 * ArtifactList Component
 *
 * Display list of artifacts with download actions.
 */

import { createResource, createSignal, Show, For } from "solid-js"
import { Card } from "@opencode-ai/ui/card"
import { Button } from "@opencode-ai/ui/button"
import { Icon } from "@opencode-ai/ui/icon"

interface Artifact {
  id: string
  filename: string
  mimeType: string
  size: number
  category?: string
  createdAt: string
  tags?: string[]
}

interface ArtifactListProps {
  sessionId: string
}

export function ArtifactList(props: ArtifactListProps) {
  const [artifacts, { refetch }] = createResource(
    () => props.sessionId,
    async (sessionId) => {
      const response = await fetch(`/api/artifact?session_id=${sessionId}`)
      if (!response.ok) throw new Error("Failed to fetch artifacts")

      const data = await response.json()
      return data.artifacts as Artifact[]
    }
  )

  const [downloading, setDownloading] = createSignal<Set<string>>(new Set())

  const downloadArtifact = async (artifactId: string, filename: string) => {
    setDownloading(prev => new Set(prev).add(artifactId))

    try {
      const response = await fetch(`/api/artifact/${artifactId}/download`)
      if (!response.ok) throw new Error("Download failed")

      const blob = await response.blob()
      const url = URL.createObjectURL(blob)

      const a = document.createElement("a")
      a.href = url
      a.download = filename
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)

    } catch (error) {
      console.error("Download failed:", error)
      alert("Failed to download artifact")
    } finally {
      setDownloading(prev => {
        const next = new Set(prev)
        next.delete(artifactId)
        return next
      })
    }
  }

  const deleteArtifact = async (artifactId: string) => {
    if (!confirm("Delete this artifact?")) return

    try {
      await fetch(`/api/artifact/${artifactId}`, { method: "DELETE" })
      refetch()
    } catch (error) {
      console.error("Delete failed:", error)
      alert("Failed to delete artifact")
    }
  }

  const formatSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  const formatDate = (timestamp: string): string => {
    return new Date(timestamp).toLocaleString()
  }

  const getArtifactIcon = (mimeType: string) => {
    if (mimeType.startsWith("image/")) return "file-image"
    if (mimeType === "application/pdf") return "file-pdf"
    if (mimeType.includes("json")) return "file-json"
    if (mimeType.includes("text") || mimeType.includes("markdown")) return "file-text"
    return "file-code"
  }

  return (
    <div class="flex flex-col h-full bg-background border-l">
      {/* Header */}
      <div class="p-3 border-b flex items-center justify-between">
        <div class="flex items-center gap-2">
          <Icon name="artifact" size="normal" class="text-text-weak" />
          <h3 class="text-14-medium">Artifacts</h3>
          <Show when={(artifacts()?.length ?? 0) > 0}>
            <span class="text-12-regular text-text-weak">
              {artifacts()?.length} files
            </span>
          </Show>
        </div>
        <Button
          size="small"
          variant="ghost"
          onClick={() => refetch()}
        />
      </div>

      {/* Content */}
      <div class="flex-1 overflow-auto">
        <Show when={artifacts.loading}>
          <div class="flex items-center justify-center py-8 text-text-weak">
            <Icon name="spinner" size="large" class="animate-spin" />
          </div>
        </Show>

        <Show when={!artifacts.loading && artifacts()?.length === 0}>
          <div class="flex flex-col items-center justify-center py-8 text-text-weak px-4 text-center">
            <Icon name="inbox" size="large" />
            <div class="text-14-regular mt-2">No artifacts yet</div>
            <div class="text-12-regular text-text-weak mt-1">
              Export files from the sandbox to see them here
            </div>
          </div>
        </Show>

        <Show when={(artifacts()?.length ?? 0) > 0}>
          <div class="p-2 space-y-1">
            <For each={artifacts() ?? []}>
              {(artifact) => (
                <div class="flex items-center gap-2 p-2 rounded hover:bg-surface-weak group">
                  {/* Icon */}
                  <Icon
                    name={getArtifactIcon(artifact.mimeType)}
                    size="normal"
                    class="text-text-weak flex-shrink-0"
                  />

                  {/* Info */}
                  <div class="flex-1 min-w-0">
                    <div class="text-13-medium text-text-strong truncate" title={artifact.filename}>
                      {artifact.filename}
                    </div>
                    <div class="flex items-center gap-2 text-11-regular text-text-weak">
                      <span>{formatSize(artifact.size)}</span>
                      <span>•</span>
                      <span>{formatDate(artifact.createdAt)}</span>
                      <Show when={artifact.category}>
                        <>
                          <span>•</span>
                          <span class="uppercase">{artifact.category}</span>
                        </>
                      </Show>
                    </div>
                  </div>

                  {/* Actions */}
                  <div class="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Button
                      size="small"
                      variant="ghost"
                      icon="download"
                      disabled={downloading().has(artifact.id)}
                      onClick={() => downloadArtifact(artifact.id, artifact.filename)}
                    />
                    <Button
                      size="small"
                      variant="ghost"
                      icon="trash"
                      onClick={() => deleteArtifact(artifact.id)}
                    />
                  </div>
                </div>
              )}
            </For>
          </div>
        </Show>
      </div>
    </div>
  )
}
