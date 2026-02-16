import { For, onCleanup, onMount, Show, Match, Switch, createMemo, createEffect, on, createSignal } from "solid-js"
import { createMediaQuery } from "@solid-primitives/media"
import { createResizeObserver } from "@solid-primitives/resize-observer"
import { Dynamic } from "solid-js/web"
import { useLocal } from "@/context/local"
import { selectionFromLines, useFile, type SelectedLineRange } from "@/context/file"
import { createStore } from "solid-js/store"
import { PromptInput } from "@/components/prompt-input"
import { SessionContextUsage } from "@/components/session-context-usage"
import { IconButton } from "@opencode-ai/ui/icon-button"
import { Icon } from "@opencode-ai/ui/icon"
import { Tooltip, TooltipKeybind } from "@opencode-ai/ui/tooltip"
import { DiffChanges } from "@opencode-ai/ui/diff-changes"
import { ResizeHandle } from "@opencode-ai/ui/resize-handle"
import { Tabs } from "@opencode-ai/ui/tabs"
import { useCodeComponent } from "@opencode-ai/ui/context/code"
import { SessionTurn } from "@opencode-ai/ui/session-turn"
import { createAutoScroll } from "@opencode-ai/ui/hooks"
import { SessionReview } from "@opencode-ai/ui/session-review"
import { SessionMessageRail } from "@opencode-ai/ui/session-message-rail"
import { MonitorPanel } from "@/components/monitor/MonitorPanel"

import { DragDropProvider, DragDropSensors, DragOverlay, SortableProvider, closestCenter } from "@thisbeyond/solid-dnd"
import type { DragEvent } from "@thisbeyond/solid-dnd"
import { useSync } from "@/context/sync"
import { useTerminal, type LocalPTY } from "@/context/terminal"
import { useLayout } from "@/context/layout"
import { Terminal } from "@/components/terminal"
import { checksum, base64Encode, base64Decode } from "@opencode-ai/util/encode"
import { useDialog } from "@opencode-ai/ui/context/dialog"
import { DialogSelectFile } from "@/components/dialog-select-file"
import { DialogSelectModel } from "@/components/dialog-select-model"
import { DialogSelectMcp } from "@/components/dialog-select-mcp"
import { useCommand } from "@/context/command"
import { useNavigate, useParams } from "@solidjs/router"
import { UserMessage } from "@opencode-ai/sdk/v2"
import type { FileDiff } from "@opencode-ai/sdk/v2/client"
import { useSDK } from "@/context/sdk"
import { usePrompt } from "@/context/prompt"
import { extractPromptFromParts } from "@/utils/prompt"
import { ConstrainDragYAxis, getDraggableId } from "@/utils/solid-dnd"
import { usePermission } from "@/context/permission"
import { showToast } from "@opencode-ai/ui/toast"
import {
  SessionHeader,
  SessionContextTab,
  SortableTab,
  FileVisual,
  SortableTerminalTab,
  NewSessionView,
} from "@/components/session"
import { usePlatform } from "@/context/platform"
import { same } from "@/utils/same"
import { ThinkingFlow, useThinkingFlow } from "@/components/ThinkingFlow"
import { ArtifactsPanel, useArtifacts } from "@/components/ArtifactsPanel"
import { SandboxView } from "@/components/SandboxView"
import { EmptyToolPanel } from "@/components/EmptyToolPanel"
import { DynamicToolPanel } from "@/components/DynamicToolPanel"
import { ReviewModal } from "@/components/ReviewModal"
import { useActiveTool } from "@/hooks/useActiveTool"
import { useSandboxEvents } from "@/hooks/useSandboxEvents"


type DiffStyle = "unified" | "split"

interface SessionReviewTabProps {
  diffs: () => FileDiff[]
  view: () => ReturnType<ReturnType<typeof useLayout>["view"]>
  diffStyle: DiffStyle
  onDiffStyleChange?: (style: DiffStyle) => void
  classes?: {
    root?: string
    header?: string
    container?: string
  }
}

function SessionReviewTab(props: SessionReviewTabProps) {
  let scroll: HTMLDivElement | undefined
  let frame: number | undefined
  let pending: { x: number; y: number } | undefined

  const restoreScroll = (retries = 0) => {
    const el = scroll
    if (!el) return

    const s = props.view().scroll("review")
    if (!s) return

    // Wait for content to be scrollable - content may not have rendered yet
    if (el.scrollHeight <= el.clientHeight && retries < 10) {
      requestAnimationFrame(() => restoreScroll(retries + 1))
      return
    }

    if (el.scrollTop !== s.y) el.scrollTop = s.y
    if (el.scrollLeft !== s.x) el.scrollLeft = s.x
  }

  const handleScroll = (event: Event & { currentTarget: HTMLDivElement }) => {
    pending = {
      x: event.currentTarget.scrollLeft,
      y: event.currentTarget.scrollTop,
    }
    if (frame !== undefined) return

    frame = requestAnimationFrame(() => {
      frame = undefined

      const next = pending
      pending = undefined
      if (!next) return

      props.view().setScroll("review", next)
    })
  }

  createEffect(
    on(
      () => props.diffs().length,
      () => {
        requestAnimationFrame(restoreScroll)
      },
      { defer: true },
    ),
  )

  onCleanup(() => {
    if (frame === undefined) return
    cancelAnimationFrame(frame)
  })

  return (
    <SessionReview
      scrollRef={(el) => {
        scroll = el
        restoreScroll()
      }}
      onScroll={handleScroll}
      open={props.view().review.open()}
      onOpenChange={props.view().review.setOpen}
      classes={{
        root: props.classes?.root ?? "pb-40",
        header: props.classes?.header ?? "px-6",
        container: props.classes?.container ?? "px-6",
      }}
      diffs={props.diffs()}
      diffStyle={props.diffStyle}
      onDiffStyleChange={props.onDiffStyleChange}
    />
  )
}

export default function Page() {
  const layout = useLayout()
  const local = useLocal()
  const file = useFile()
  const sync = useSync()
  const terminal = useTerminal()
  const dialog = useDialog()
  const codeComponent = useCodeComponent()
  const command = useCommand()
  const platform = usePlatform()
  const params = useParams()
  const navigate = useNavigate()
  const sdk = useSDK()
  const prompt = usePrompt()
  const permission = usePermission()

  /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
  const info = createMemo(() => {
    if (!params.id) return undefined
    const sessionInfo = sync.session.get(params.id)
    return sessionInfo as any
  })

  // Sandbox Mode Handling
  // If in sandbox mode, render SandboxView and bypass standard session layout
  const isSandbox = createMemo(() => {
    // If accessed via /session/:id (no dir), treat as sandbox
    return !params.dir && !!params.id
  })

  // We return early for Sandbox View to avoid running all the efficient layout logic below
  // which depends on files/directories
  return (
    <Show
      when={isSandbox()}
      fallback={
        <StandardSession
          layout={layout}
          local={local}
          file={file}
          sync={sync}
          terminal={terminal}
          dialog={dialog}
          codeComponent={codeComponent}
          command={command}
          platform={platform}
          params={params}
          navigate={navigate}
          sdk={sdk}
          prompt={prompt}
          permission={permission}
          info={info}
        />
      }
    >
      <SandboxView sessionId={params.id!} />
    </Show>
  )
}

function StandardSession(props: any) {
  const {
    layout,
    local,
    file,
    sync,
    terminal,
    dialog,
    codeComponent,
    command,
    platform,
    params,
    navigate,
    sdk,
    prompt,
    permission,
    info,
  } = props


  const sessionKey = createMemo(() => `${params.dir}${params.id ? "/" + params.id : ""}`)
  const tabs = createMemo(() => layout.tabs(sessionKey()))
  const view = createMemo(() => layout.view(sessionKey()))

  const isDesktop = createMediaQuery("(min-width: 768px)")

  function normalizeTab(tab: string) {
    if (!tab.startsWith("file://")) return tab
    return file.tab(tab)
  }

  function normalizeTabs(list: string[]) {
    const seen = new Set<string>()
    const next: string[] = []
    for (const item of list) {
      const value = normalizeTab(item)
      if (seen.has(value)) continue
      seen.add(value)
      next.push(value)
    }
    return next
  }

  const openTab = (value: string) => {
    const next = normalizeTab(value)
    tabs().open(next)

    const path = file.pathFromTab(next)
    if (path) file.load(path)
  }

  createEffect(() => {
    const active = tabs().active()
    if (!active) return

    const path = file.pathFromTab(active)
    if (path) file.load(path)
  })

  createEffect(() => {
    const current = tabs().all()
    if (current.length === 0) return

    const next = normalizeTabs(current)
    if (same(current, next)) return

    tabs().setAll(next)

    const active = tabs().active()
    if (!active) return
    if (!active.startsWith("file://")) return

    const normalized = normalizeTab(active)
    if (active === normalized) return
    tabs().setActive(normalized)
  })

  // info is passed as prop
  // const info = createMemo(() => (params.id ? sync.session.get(params.id) : undefined))

  // Check if this is a sandbox session
  const isSandbox = createMemo(() => {
    return info()?.mode === "sandbox" || (!params.dir && !!params.id)
  })
  const revertMessageID = createMemo(() => info()?.revert?.messageID)
  const messages = createMemo(() => (params.id ? (sync.data.message[params.id] ?? []) : []))
  const messagesReady = createMemo(() => {
    const id = params.id
    if (!id) return true
    return sync.data.message[id] !== undefined
  })
  const emptyUserMessages: UserMessage[] = []
  const userMessages = createMemo(
    () => messages().filter((m: { role: string }) => m.role === "user") as UserMessage[],
    emptyUserMessages,
  )
  const visibleUserMessages = createMemo(() => {
    const revert = revertMessageID()
    if (!revert) return userMessages()
    return userMessages().filter((m: UserMessage) => m.id < revert)
  }, emptyUserMessages)
  const lastUserMessage = createMemo(() => visibleUserMessages().at(-1))

  createEffect(
    on(
      () => lastUserMessage()?.id,
      () => {
        const msg = lastUserMessage()
        if (!msg) return
        if (msg.agent) local.agent.set(msg.agent)
        if (msg.model) local.model.set(msg.model)
      },
    ),
  )

  const [store, setStore] = createStore({
    activeDraggable: undefined as string | undefined,
    activeTerminalDraggable: undefined as string | undefined,
    expanded: {} as Record<string, boolean>,
    messageId: undefined as string | undefined,
    mobileTab: "session" as "session" | "review",
    newSessionWorktree: "main",
    promptHeight: 0,
  })

  const newSessionWorktree = createMemo(() => {
    if (store.newSessionWorktree === "create") return "create"
    const project = sync.project
    if (project && sync.data.path.directory !== project.worktree) return sync.data.path.directory
    return "main"
  })

  const activeMessage = createMemo(() => {
    if (!store.messageId) return lastUserMessage()
    const found = visibleUserMessages()?.find((m) => m.id === store.messageId)
    return found ?? lastUserMessage()
  })
  const setActiveMessage = (message: UserMessage | undefined) => {
    setStore("messageId", message?.id)
  }

  function navigateMessageByOffset(offset: number) {
    const msgs = visibleUserMessages()
    if (msgs.length === 0) return

    const current = activeMessage()
    const currentIndex = current ? msgs.findIndex((m) => m.id === current.id) : -1

    let targetIndex: number
    if (currentIndex === -1) {
      targetIndex = offset > 0 ? 0 : msgs.length - 1
    } else {
      targetIndex = currentIndex + offset
    }

    if (targetIndex < 0 || targetIndex >= msgs.length) return

    scrollToMessage(msgs[targetIndex], "auto")
  }

  const diffs = createMemo(() => (params.id ? (sync.data.session_diff[params.id] ?? []) : []))

  const idle = { type: "idle" as const }
  let inputRef!: HTMLDivElement
  let promptDock: HTMLDivElement | undefined
  let scroller: HTMLDivElement | undefined

  createEffect(() => {
    sync.session.sync(params.id)
  })

  // Thinking Flow & Artifacts State
  const { steps, handleStepStart, handleStepFinish } = useThinkingFlow()
  const { artifacts, handleArtifact } = useArtifacts()
  const [hasArtifacts, setHasArtifacts] = createSignal(false)

  // Active Tool & Sandbox Events State
  const sessionId = createMemo(() => params.id ?? "")
  const { activeTool, clearActiveTool } = useActiveTool(sessionId)
  const { state: sandboxState, clearShellOutput, clearBrowserEvents, clearFileChanges } = useSandboxEvents(sessionId)

  // Tool Panel Visibility State
  const shouldShowToolPanel = createMemo(() => isDesktop() && activeTool().type !== null)

  // Modal states for Review
  const [reviewModalOpen, setReviewModalOpen] = createSignal(false)

  // Register keyboard shortcuts
  onMount(() => {

    // Override review.toggle to open modal instead of panel
    command.register(() => [
      {
        id: "review.toggle",
        keybind: "Ctrl+Shift+R",
        title: "Open review modal",
        onSelect: () => {
          setReviewModalOpen(true)
        },
      },
    ])

    command.register(() => [
      {
        id: "review.open",
        keybind: "Ctrl+Shift+R",
        title: "Open review modal",
        onSelect: () => {
          setReviewModalOpen(true)
        },
      },
    ])

    // Register artifacts.open command for the MonitorPanel
    command.register(() => [
      {
        id: "artifacts.open",
        keybind: "Ctrl+Shift+A",
        title: "Open artifacts panel",
        onSelect: () => {
          layout.monitor.toggle()
        },
      },
    ])

  })

  createEffect(() => {
    if (artifacts().length > 0) {
      setHasArtifacts(true)
      if (!layout.review.opened()) {
        layout.review.setOpen(true)
      }
    }
  })

  // Subscribe to SDK events
  createEffect(() => {
    const directory = sdk.directory
    const unsub = sdk.event.on(directory, (event: any) => {
      switch (event.type) {
        case "agent.step.start":
          handleStepStart({ step: event.step, timestamp: Date.now() })
          break
        case "agent.step.finish":
          handleStepFinish({
            step: event.step,
            timestamp: Date.now(),
            status: event.error ? "error" : "success",
            duration: 0,
            error: event.error?.message,
          })
          break
      }
    })
    onCleanup(unsub)
  })

  createEffect(() => {
    if (layout.terminal.opened()) {
      if (terminal.all().length === 0) {
        terminal.new()
      }
    }
  })

  createEffect(
    on(
      () => visibleUserMessages().at(-1)?.id,
      (lastId, prevLastId) => {
        if (lastId && prevLastId && lastId > prevLastId) {
          setStore("messageId", undefined)
        }
      },
      { defer: true },
    ),
  )

  const status = createMemo(() => sync.data.session_status[params.id ?? ""] ?? idle)

  createEffect(
    on(
      () => params.id,
      () => {
        setStore("messageId", undefined)
        setStore("expanded", {})
      },
      { defer: true },
    ),
  )

  createEffect(() => {
    const id = lastUserMessage()?.id
    if (!id) return
    setStore("expanded", id, status().type !== "idle")
  })

  command.register(() => [
    {
      id: "session.new",
      title: "New session",
      description: "Create a new session",
      category: "Session",
      keybind: "mod+shift+s",
      slash: "new",
      onSelect: () => navigate(`/${params.dir}/session`),
    },
    {
      id: "file.open",
      title: "Open file",
      description: "Search and open a file",
      category: "File",
      keybind: "mod+p",
      slash: "open",
      onSelect: () => dialog.show(() => <DialogSelectFile />),
    },
    {
      id: "terminal.toggle",
      title: "Toggle terminal",
      description: "Show or hide the terminal",
      category: "View",
      keybind: "ctrl+`",
      slash: "terminal",
      onSelect: () => layout.terminal.toggle(),
    },
    {
      id: "review.toggle",
      title: "Toggle review",
      description: "Show or hide the review panel",
      category: "View",
      keybind: "mod+shift+r",
      onSelect: () => layout.review.toggle(),
    },
    {
      id: "terminal.new",
      title: "New terminal",
      description: "Create a new terminal tab",
      category: "Terminal",
      keybind: "ctrl+shift+`",
      onSelect: () => terminal.new(),
    },
    {
      id: "steps.toggle",
      title: "Toggle steps",
      description: "Show or hide steps for the current message",
      category: "View",
      keybind: "mod+e",
      slash: "steps",
      disabled: !params.id,
      onSelect: () => {
        const msg = activeMessage()
        if (!msg) return
        setStore("expanded", msg.id, (open: boolean | undefined) => !open)
      },
    },
    {
      id: "message.previous",
      title: "Previous message",
      description: "Go to the previous user message",
      category: "Session",
      keybind: "mod+arrowup",
      disabled: !params.id,
      onSelect: () => navigateMessageByOffset(-1),
    },
    {
      id: "message.next",
      title: "Next message",
      description: "Go to the next user message",
      category: "Session",
      keybind: "mod+arrowdown",
      disabled: !params.id,
      onSelect: () => navigateMessageByOffset(1),
    },
    {
      id: "model.choose",
      title: "Choose model",
      description: "Select a different model",
      category: "Model",
      keybind: "mod+'",
      slash: "model",
      onSelect: () => dialog.show(() => <DialogSelectModel />),
    },
    {
      id: "mcp.toggle",
      title: "Toggle MCPs",
      description: "Toggle MCPs",
      category: "MCP",
      keybind: "mod+;",
      slash: "mcp",
      onSelect: () => dialog.show(() => <DialogSelectMcp />),
    },
    {
      id: "agent.cycle",
      title: "Cycle agent",
      description: "Switch to the next agent",
      category: "Agent",
      keybind: "mod+.",
      slash: "agent",
      onSelect: () => local.agent.move(1),
    },
    {
      id: "agent.cycle.reverse",
      title: "Cycle agent backwards",
      description: "Switch to the previous agent",
      category: "Agent",
      keybind: "shift+mod+.",
      onSelect: () => local.agent.move(-1),
    },
    {
      id: "model.variant.cycle",
      title: "Cycle thinking effort",
      description: "Switch to the next effort level",
      category: "Model",
      keybind: "shift+mod+t",
      onSelect: () => {
        local.model.variant.cycle()
        showToast({
          title: "Thinking effort changed",
          description: "The thinking effort has been changed to " + (local.model.variant.current() ?? "Default"),
        })
      },
    },
    {
      id: "permissions.autoaccept",
      title: params.id && permission.isAutoAccepting(params.id) ? "Stop auto-accepting edits" : "Auto-accept edits",
      category: "Permissions",
      keybind: "mod+shift+a",
      disabled: !params.id || !permission.permissionsEnabled(),
      onSelect: () => {
        const sessionID = params.id
        if (!sessionID) return
        permission.toggleAutoAccept(sessionID, sdk.directory)
        showToast({
          title: permission.isAutoAccepting(sessionID) ? "Auto-accepting edits" : "Stopped auto-accepting edits",
          description: permission.isAutoAccepting(sessionID)
            ? "Edit and write permissions will be automatically approved"
            : "Edit and write permissions will require approval",
        })
      },
    },
    {
      id: "session.undo",
      title: "Undo",
      description: "Undo the last message",
      category: "Session",
      slash: "undo",
      disabled: !params.id || visibleUserMessages().length === 0,
      onSelect: async () => {
        const sessionID = params.id
        if (!sessionID) return
        if (status()?.type !== "idle") {
          await sdk.client.session.abort({ sessionID }).catch(() => {})
        }
        const revert = info()?.revert?.messageID
        // Find the last user message that's not already reverted
        const message = userMessages().findLast((x) => !revert || x.id < revert)
        if (!message) return
        await sdk.client.session.revert({ sessionID, messageID: message.id })
        // Restore the prompt from the reverted message
        const parts = sync.data.part[message.id]
        if (parts) {
          const restored = extractPromptFromParts(parts, { directory: sdk.directory })
          prompt.set(restored)
        }
        // Navigate to the message before the reverted one (which will be the new last visible message)
        const priorMessage = userMessages().findLast((x) => x.id < message.id)
        setActiveMessage(priorMessage)
      },
    },
    {
      id: "session.redo",
      title: "Redo",
      description: "Redo the last undone message",
      category: "Session",
      slash: "redo",
      disabled: !params.id || !info()?.revert?.messageID,
      onSelect: async () => {
        const sessionID = params.id
        if (!sessionID) return
        const revertMessageID = info()?.revert?.messageID
        if (!revertMessageID) return
        const nextMessage = userMessages().find((x) => x.id > revertMessageID)
        if (!nextMessage) {
          // Full unrevert - restore all messages and navigate to last
          await sdk.client.session.unrevert({ sessionID })
          prompt.reset()
          // Navigate to the last message (the one that was at the revert point)
          const lastMsg = userMessages().findLast((x) => x.id >= revertMessageID)
          setActiveMessage(lastMsg)
          return
        }
        // Partial redo - move forward to next message
        await sdk.client.session.revert({ sessionID, messageID: nextMessage.id })
        // Navigate to the message before the new revert point
        const priorMsg = userMessages().findLast((x) => x.id < nextMessage.id)
        setActiveMessage(priorMsg)
      },
    },
    {
      id: "session.compact",
      title: "Compact session",
      description: "Summarize the session to reduce context size",
      category: "Session",
      slash: "compact",
      disabled: !params.id || visibleUserMessages().length === 0,
      onSelect: async () => {
        const sessionID = params.id
        if (!sessionID) return
        const model = local.model.current()
        if (!model) {
          showToast({
            title: "No model selected",
            description: "Connect a provider to summarize this session",
          })
          return
        }
        await sdk.client.session.summarize({
          sessionID,
          modelID: model.id,
          providerID: model.provider.id,
        })
      },
    },
  ])

  const handleKeyDown = (event: KeyboardEvent) => {
    const activeElement = document.activeElement as HTMLElement | undefined
    if (activeElement) {
      const isProtected = activeElement.closest("[data-prevent-autofocus]")
      const isInput = /^(INPUT|TEXTAREA|SELECT)$/.test(activeElement.tagName) || activeElement.isContentEditable
      if (isProtected || isInput) return
    }
    if (dialog.active) return

    if (activeElement === inputRef) {
      if (event.key === "Escape") inputRef?.blur()
      return
    }

    if (event.key.length === 1 && event.key !== "Unidentified" && !(event.ctrlKey || event.metaKey)) {
      inputRef?.focus()
    }
  }

  const handleDragStart = (event: unknown) => {
    const id = getDraggableId(event)
    if (!id) return
    setStore("activeDraggable", id)
  }

  const handleDragOver = (event: DragEvent) => {
    const { draggable, droppable } = event
    if (draggable && droppable) {
      const currentTabs = tabs().all()
      const fromIndex = currentTabs?.indexOf(draggable.id.toString())
      const toIndex = currentTabs?.indexOf(droppable.id.toString())
      if (fromIndex !== toIndex && toIndex !== undefined) {
        tabs().move(draggable.id.toString(), toIndex)
      }
    }
  }

  const handleDragEnd = () => {
    setStore("activeDraggable", undefined)
  }

  const handleTerminalDragStart = (event: unknown) => {
    const id = getDraggableId(event)
    if (!id) return
    setStore("activeTerminalDraggable", id)
  }

  const handleTerminalDragOver = (event: DragEvent) => {
    const { draggable, droppable } = event
    if (draggable && droppable) {
      const terminals = terminal.all()
      const fromIndex = terminals.findIndex((t: LocalPTY) => t.id === draggable.id.toString())
      const toIndex = terminals.findIndex((t: LocalPTY) => t.id === droppable.id.toString())
      if (fromIndex !== -1 && toIndex !== -1 && fromIndex !== toIndex) {
        terminal.move(draggable.id.toString(), toIndex)
      }
    }
  }

  const handleTerminalDragEnd = () => {
    setStore("activeTerminalDraggable", undefined)
  }

  const contextOpen = createMemo(() => tabs().active() === "context" || tabs().all().includes("context"))
  const openedTabs = createMemo(() =>
    tabs()
      .all()
      .filter((tab: string) => tab !== "context"),
  )

  const reviewTab = createMemo(() => diffs().length > 0 || tabs().active() === "review")
  const mobileReview = createMemo(() => !isDesktop() && diffs().length > 0 && store.mobileTab === "review")

  const showTabs = createMemo(
    () => layout.review.opened() && (diffs().length > 0 || tabs().all().length > 0 || contextOpen()),
  )

  const activeTab = createMemo(() => {
    const active = tabs().active()
    if (active) return active
    if (reviewTab()) return "review"

    const first = openedTabs()[0]
    if (first) return first
    if (contextOpen()) return "context"
    return "review"
  })

  createEffect(() => {
    if (!layout.ready()) return
    if (tabs().active()) return
    if (diffs().length === 0 && openedTabs().length === 0 && !contextOpen()) return
    tabs().setActive(activeTab())
  })

  const isWorking = createMemo(() => status().type !== "idle")
  const autoScroll = createAutoScroll({
    working: isWorking,
  })

  let scrollSpyFrame: number | undefined
  let scrollSpyTarget: HTMLDivElement | undefined

  const anchor = (id: string) => `message-${id}`

  const setScrollRef = (el: HTMLDivElement | undefined) => {
    scroller = el
    autoScroll.scrollRef(el)
  }

  createResizeObserver(
    () => promptDock,
    ({ height }) => {
      const next = Math.ceil(height)

      if (next === store.promptHeight) return

      const el = scroller
      const stick = el ? el.scrollHeight - el.clientHeight - el.scrollTop < 10 : false

      setStore("promptHeight", next)

      if (stick && el) {
        requestAnimationFrame(() => {
          el.scrollTo({ top: el.scrollHeight, behavior: "auto" })
        })
      }
    },
  )

  const updateHash = (id: string) => {
    window.history.replaceState(null, "", `#${anchor(id)}`)
  }

  const scrollToMessage = (message: UserMessage, behavior: ScrollBehavior = "smooth") => {
    setActiveMessage(message)

    const el = document.getElementById(anchor(message.id))
    if (el) el.scrollIntoView({ behavior, block: "start" })
    updateHash(message.id)
  }

  const getActiveMessageId = (container: HTMLDivElement) => {
    const cutoff = container.scrollTop + 100
    const nodes = container.querySelectorAll<HTMLElement>("[data-message-id]")
    let id: string | undefined

    for (const node of nodes) {
      const next = node.dataset.messageId
      if (!next) continue
      if (node.offsetTop > cutoff) break
      id = next
    }

    return id
  }

  const scheduleScrollSpy = (container: HTMLDivElement) => {
    scrollSpyTarget = container
    if (scrollSpyFrame !== undefined) return

    scrollSpyFrame = requestAnimationFrame(() => {
      scrollSpyFrame = undefined

      const target = scrollSpyTarget
      scrollSpyTarget = undefined
      if (!target) return

      const id = getActiveMessageId(target)
      if (!id) return
      if (id === store.messageId) return

      setStore("messageId", id)
    })
  }

  createEffect(() => {
    const sessionID = params.id
    const ready = messagesReady()
    if (!sessionID || !ready) return

    requestAnimationFrame(() => {
      const id = window.location.hash.slice(1)
      const hashTarget = id ? document.getElementById(id) : undefined
      if (hashTarget) {
        hashTarget.scrollIntoView({ behavior: "auto", block: "start" })
        return
      }
      autoScroll.forceScrollToBottom()
    })
  })

  createEffect(() => {
    document.addEventListener("keydown", handleKeyDown)
  })

  onCleanup(() => {
    document.removeEventListener("keydown", handleKeyDown)
    if (scrollSpyFrame !== undefined) cancelAnimationFrame(scrollSpyFrame)
  })

  return (
    <div class="relative bg-background-base size-full overflow-hidden flex flex-col" data-testid="session-id">
      <SessionHeader />
      <div class="flex-1 min-h-0 flex flex-col md:flex-row">
        {/* Mobile tab bar - only shown on mobile when there are diffs */}
        <Show when={!isDesktop() && diffs().length > 0}>
          <Tabs class="h-auto">
            <Tabs.List>
              <Tabs.Trigger
                value="session"
                class="w-1/2"
                classes={{ button: "w-full" }}
                onClick={() => setStore("mobileTab", "session")}
              >
                Session
              </Tabs.Trigger>
              <Tabs.Trigger
                value="review"
                class="w-1/2 !border-r-0"
                classes={{ button: "w-full" }}
                onClick={() => setStore("mobileTab", "review")}
              >
                {diffs().length} Files Changed
              </Tabs.Trigger>
            </Tabs.List>
          </Tabs>
        </Show>

        {/* Session panel */}
        <div
          classList={{
            "@container relative shrink-0 flex flex-col min-h-0 h-full bg-background-stronger": true,
            "flex-1 md:flex-none py-6 md:py-3 transition-[width] duration-300 ease-in-out": true,
          }}
          style={{
            width: !isDesktop()
              ? "100%"
              : shouldShowToolPanel()
                ? "50%"
                : layout.monitor.opened()
                  ? "40%" // 聊天面板占 40%
                  : "100%",
            flex: layout.monitor.opened() ? "0 0 40%" : undefined,
            "--prompt-height": store.promptHeight ? `${store.promptHeight}px` : undefined,
          }}
        >
          <div class="flex-1 min-h-0 overflow-hidden">
            <Switch>
              <Match when={params.id}>
                <Show when={activeMessage()}>
                  <Show
                    when={!mobileReview()}
                    fallback={
                      <div class="relative h-full overflow-hidden">
                        <SessionReviewTab
                          diffs={diffs}
                          view={view}
                          diffStyle="unified"
                          classes={{
                            root: "pb-[calc(var(--prompt-height,8rem)+32px)]",
                            header: "px-4",
                            container: "px-4",
                          }}
                        />
                      </div>
                    }
                  >
                    <div class="relative w-full h-full min-w-0">
                      <Show when={isDesktop() && !layout.monitor.opened()}>
                        <div class="absolute inset-0 pointer-events-none z-10">
                          <SessionMessageRail
                            messages={visibleUserMessages()}
                            current={activeMessage()}
                            onMessageSelect={scrollToMessage}
                            wide={!showTabs()}
                            class="pointer-events-auto"
                          />
                        </div>
                      </Show>
                      <div
                        ref={setScrollRef}
                        onScroll={(e) => {
                          autoScroll.handleScroll()
                          if (isDesktop()) scheduleScrollSpy(e.currentTarget)
                        }}
                        onClick={autoScroll.handleInteraction}
                        class="relative min-w-0 w-full h-full overflow-y-auto no-scrollbar"
                      >
                        <div
                          ref={autoScroll.contentRef}
                          class="flex flex-col gap-32 items-start justify-start pb-[calc(var(--prompt-height,8rem)+64px)] md:pb-[calc(var(--prompt-height,10rem)+64px)] transition-[margin]"
                          classList={{
                            "mt-0.5": !showTabs(),
                            "mt-0": showTabs(),
                          }}
                        >
                          <For each={visibleUserMessages()}>
                            {(message) => (
                              <div
                                id={anchor(message.id)}
                                data-message-id={message.id}
                                classList={{
                                  "min-w-0 w-full max-w-full": true,
                                  "last:min-h-[calc(100vh-5.5rem-var(--prompt-height,8rem)-64px)] md:last:min-h-[calc(100vh-4.5rem-var(--prompt-height,8rem)-64px)]":
                                    platform.platform !== "desktop",
                                  "last:min-h-[calc(100vh-7rem-var(--prompt-height,8rem)-64px)] md:last:min-h-[calc(100vh-6rem-var(--prompt-height,10rem)-64px)]":
                                    platform.platform === "desktop",
                                }}
                              >
                                <SessionTurn
                                  sessionID={params.id!}
                                  messageID={message.id}
                                  lastUserMessageID={lastUserMessage()?.id}
                                  stepsExpanded={store.expanded[message.id] ?? false}
                                  onStepsExpandedToggle={() =>
                                    setStore("expanded", message.id, (open: boolean | undefined) => !open)
                                  }
                                  classes={{
                                    root: "min-w-0 w-full relative",
                                    content:
                                      "flex flex-col justify-between !overflow-visible [&_[data-slot=session-turn-message-header]]:top-[-32px]",
                                    container: `px-4 md:px-6 ${shouldShowToolPanel() ? "" : "md:max-w-200 md:mx-auto"}`,
                                  }}
                                />
                              </div>
                            )}
                          </For>

                          {/* Thinking Flow Visualization */}
                          <Show when={steps().length > 0}>
                            <div
                              classList={{
                                "w-full px-4 md:px-6 mt-4 mb-4": true,
                                "md:max-w-200 md:mx-auto": !shouldShowToolPanel(),
                              }}
                            >
                              <ThinkingFlow steps={steps()} />
                            </div>
                          </Show>
                        </div>
                      </div>
                    </div>
                  </Show>
                </Show>
              </Match>
              <Match when={true}>
                <Show when={!!sync.project?.worktree}>
                  <NewSessionView
                    worktree={newSessionWorktree()}
                    onWorktreeChange={(value) => {
                      if (value === "create") {
                        setStore("newSessionWorktree", value)
                        return
                      }

                      setStore("newSessionWorktree", "main")

                      const target = value === "main" ? sync.project?.worktree : value
                      if (!target) return
                      if (target === sync.data.path.directory) return
                      layout.projects.open(target)
                      // For sandbox/global mode, use simplified URL
                      if (!target || target === "global") {
                        navigate(`/session`)
                      } else {
                        navigate(`/${base64Encode(target)}/session`)
                      }
                    }}
                  />
                </Show>
                <Show when={!sync.project?.worktree}>
                  <div class="size-full flex flex-col pb-45 justify-end items-center gap-4 flex-[1_0_0] self-stretch max-w-200 mx-auto px-6 text-center">
                    <div class="text-20-medium text-text-weaker">开始新对话</div>
                    <div class="text-14-regular text-text-weak">在沙盒环境中开始对话，随时可以连接项目</div>
                  </div>
                </Show>
              </Match>
            </Switch>
          </div>

          {/* Prompt input */}
          <div
            ref={(el) => (promptDock = el)}
            class="absolute inset-x-0 bottom-0 pt-12 pb-4 md:pb-8 flex flex-col justify-center items-center z-50 px-4 md:px-0 bg-gradient-to-t from-background-stronger via-background-stronger to-transparent pointer-events-none"
          >
            <div
              classList={{
                "w-full md:px-6 pointer-events-auto": true,
                "md:max-w-200": !shouldShowToolPanel(),
              }}
            >
              <PromptInput
                ref={(el) => {
                  inputRef = el
                }}
                newSessionWorktree={newSessionWorktree()}
                onNewSessionWorktreeReset={() => setStore("newSessionWorktree", "main")}
              />
            </div>
          </div>
        </div>

        {/* Dynamic Tool Panel - 右侧工具面板 */}
        <Show when={shouldShowToolPanel()}>
          <div class="relative flex-1 min-w-0 h-full border-l border-border-weak-base bg-background transition-[width] duration-300 ease-in-out">
            <DynamicToolPanel
              activeTool={activeTool}
              onClear={clearActiveTool}
              shellOutput={() => sandboxState.shellOutput}
              browserEvents={() => sandboxState.browserEvents}
              fileChanges={() => sandboxState.fileChanges}
              onClearShell={clearShellOutput}
              onClearBrowser={clearBrowserEvents}
              onClearFiles={clearFileChanges}
            />
          </div>
        </Show>

        {/* Monitor Panel - 右侧多态容器 */}
        <Show when={isDesktop()}>
          <div
            class="flex-shrink-0"
            style={{
              width: layout.monitor.opened() ? "60%" : undefined, // 监控面板占 60%
              flex: layout.monitor.opened() ? "0 0 60%" : undefined,
            }}
          >
            <MonitorPanel sessionId={sessionId()} />
          </div>
        </Show>
      </div>

      {/* Review Modal */}
      <ReviewModal
        sessionId={sessionId()}
        directory={() => params.dir ?? ""}
        open={() => reviewModalOpen()}
        onOpenChange={setReviewModalOpen}
      />
    </div>
  )
}
