/**
 * Review Modal Component
 *
 * 模态对话框形式的代码审查界面，提供专注的文件变更审查体验。
 * 用户可以查看所有文件变更，对比代码，并接受或拒绝修改。
 */

import { For, Show, createMemo, createSignal } from "solid-js"
import { Icon } from "@opencode-ai/ui/icon"
import { Button } from "@opencode-ai/ui/button"
import { IconButton } from "@opencode-ai/ui/icon-button"
import { Dialog } from "@opencode-ai/ui/dialog"
import { SessionReview } from "@opencode-ai/ui/session-review"
import { DiffChanges } from "@opencode-ai/ui/diff-changes"
import { useLayout } from "@/context/layout"
import { useSync } from "@/context/sync"
import type { FileDiff } from "@opencode-ai/sdk/v2/client"
import { base64Decode } from "@opencode-ai/util/encode"

export interface ReviewModalProps {
  /** Session ID */
  sessionId: string
  /** Directory (base64 encoded) */
  directory: () => string
  /** 对话框是否打开 */
  open: () => boolean
  /** 设置对话框打开状态 */
  onOpenChange: (open: boolean) => void
}

export function ReviewModal(props: ReviewModalProps) {
  const layout = useLayout()
  const sync = useSync()
  const directory = createMemo(() => base64Decode(props.directory()))

  // 获取文件变更列表
  const diffs = createMemo(() => {
    const sessionId = props.sessionId
    return sync.data.session_diff[sessionId] ?? []
  })

  // 获取 Session 信息
  const info = createMemo(() => {
    const sessionId = props.sessionId
    return sync.data.session.find((s) => s.id === sessionId)
  })

  // 当前选中的文件
  const [selectedFileId, setSelectedFileId] = createSignal<string | undefined>()
  const selectedDiff = createMemo(() => {
    if (!selectedFileId()) return undefined
    return diffs().find((d) => d.file === selectedFileId())
  })

  const view = createMemo(() => layout.view(`${directory()}/${props.sessionId}`))

  return (
    <Dialog open={props.open()} onOpenChange={props.onOpenChange} size="large">
      <Dialog.Content class="max-h-[80vh] flex flex-col p-0 gap-0">
        {/* Header */}
        <div class="flex items-center justify-between px-6 py-4 border-b border-border-weak">
          <div class="flex items-center gap-3">
            <Icon name="review" size="normal" class="text-icon-brand-base" />
            <div>
              <div class="text-16-medium text-text-strong">Review</div>
              <Show when={info()?.summary?.files}>
                <div class="text-12-regular text-text-weak">
                  {info()?.summary?.files ?? 0} 个文件变更
                </div>
              </Show>
            </div>
          </div>
          <div class="flex items-center gap-2">
            <Show when={selectedDiff()}>
              {(diff) => (
                <div class="text-xs text-text-weak">
                  {diff().file}
                </div>
              )}
            </Show>
            <IconButton
              icon="close"
              variant="ghost"
              onClick={() => props.onOpenChange(false)}
            />
          </div>
        </div>

        {/* File List */}
        <div class="px-6 py-3 border-b border-border-weak bg-surface-weak">
          <div class="flex items-center gap-2 mb-2">
            <DiffChanges changes={diffs()} variant="bars" />
            <Show when={info()?.summary}>
              {(summary) => (
                <div class="text-12-regular text-text-weak">
                  {summary().additions} additions, {summary().deletions} deletions
                </div>
              )}
            </Show>
          </div>

          <div class="flex flex-wrap gap-2">
            <For each={diffs()}>
              {(diff) => (
                <button
                  type="button"
                  classList={{
                    "px-3 py-1.5 rounded border text-sm text-left flex items-center gap-2 transition-colors": true,
                    "border-border-base bg-surface-base hover:bg-surface-raised-base-hover": selectedFileId() !== diff.file,
                    "border-brand-base bg-surface-brand-base/10 hover:bg-surface-brand-base/20 text-icon-brand-base": selectedFileId() === diff.file,
                  }}
                  onClick={() => setSelectedFileId(diff.file)}
                >
                  <Icon
                    name={diff.additions > 0 && diff.deletions === 0 ? "file" : diff.additions === 0 && diff.deletions > 0 ? "trash" : "pencil-line"}
                    size="small"
                  />
                  <span class="max-w-[200px] truncate">{diff.file}</span>
                </button>
              )}
            </For>
          </div>
        </div>

        {/* Diff Content */}
        <div class="flex-1 min-h-0 overflow-y-auto px-6 py-4">
          <Show when={selectedDiff()} fallback={
            <div class="flex flex-col items-center justify-center h-full text-text-weak gap-4">
              <Icon name="review" size="large" class="text-text-weaker" />
              <div class="text-center">
                <div class="text-14-medium">选择一个文件查看变更</div>
                <div class="text-12-regular text-text-weaker">
                  点击上方文件列表中的文件
                </div>
              </div>
            </div>
          }>
            {(diffValue) => {
              const diff = diffValue()
              return diff ? (
                <SessionReview
                  diffs={[diff]}
                  diffStyle="unified"
                  onDiffStyleChange={() => {}}
                />
              ) : null
            }}
          </Show>
        </div>

        {/* Footer */}
        <div class="px-6 py-3 border-t border-border-weak bg-surface-weak flex items-center justify-end gap-2">
          <Button
            variant="ghost"
            onClick={() => props.onOpenChange(false)}
            class="text-text-weak"
          >
            关闭
          </Button>
          <Show when={info()?.summary}>
            {(summary) => (
              <Button
                variant="primary"
                onClick={() => {
                  // TODO: 实现接受所有变更的逻辑
                  props.onOpenChange(false)
                }}
              >
                接受所有变更
              </Button>
            )}
          </Show>
        </div>
      </Dialog.Content>
    </Dialog>
  )
}
