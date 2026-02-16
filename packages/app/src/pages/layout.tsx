import {
  createEffect,
  createMemo,
  createSignal,
  For,
  Match,
  onCleanup,
  onMount,
  ParentProps,
  Show,
  Switch,
  untrack,
  type JSX,
} from "solid-js"
import { DateTime } from "luxon"
import { A, useNavigate, useParams } from "@solidjs/router"
import { useLayout, getAvatarColors, LocalProject } from "@/context/layout"
import { useGlobalSync } from "@/context/global-sync"
import { base64Decode, base64Encode } from "@opencode-ai/util/encode"
import { Avatar } from "@opencode-ai/ui/avatar"
import { ResizeHandle } from "@opencode-ai/ui/resize-handle"
import { Button } from "@opencode-ai/ui/button"
import { Icon } from "@opencode-ai/ui/icon"
import { IconButton } from "@opencode-ai/ui/icon-button"
import { Tooltip, TooltipKeybind } from "@opencode-ai/ui/tooltip"
import { Collapsible } from "@opencode-ai/ui/collapsible"
import { DiffChanges } from "@opencode-ai/ui/diff-changes"
import { Spinner } from "@opencode-ai/ui/spinner"
import { Mark } from "@opencode-ai/ui/logo"
import { getFilename } from "@opencode-ai/util/path"
import { DropdownMenu } from "@opencode-ai/ui/dropdown-menu"
import { Session } from "@opencode-ai/sdk/v2/client"
import { usePlatform } from "@/context/platform"
import { createStore, produce } from "solid-js/store"
import {
  DragDropProvider,
  DragDropSensors,
  DragOverlay,
  SortableProvider,
  closestCenter,
  createSortable,
} from "@thisbeyond/solid-dnd"
import type { DragEvent } from "@thisbeyond/solid-dnd"
import { useProviders } from "@/hooks/use-providers"
import { showToast, Toast, toaster } from "@opencode-ai/ui/toast"
import { useGlobalSDK } from "@/context/global-sdk"
import { useNotification } from "@/context/notification"
import { usePermission } from "@/context/permission"
import { Binary } from "@opencode-ai/util/binary"

import { useDialog } from "@opencode-ai/ui/context/dialog"
import { useTheme, type ColorScheme } from "@opencode-ai/ui/theme"
import { DialogSelectProvider } from "@/components/dialog-select-provider"
import { DialogEditProject } from "@/components/dialog-edit-project"
import { DialogSelectServer } from "@/components/dialog-select-server"
import { useCommand, type CommandOption } from "@/context/command"
import { ConstrainDragXAxis } from "@/utils/solid-dnd"
import { useServer } from "@/context/server"

export default function Layout(props: ParentProps) {
  const [store, setStore] = createStore({
    lastSession: {} as { [directory: string]: string },
    activeDraggable: undefined as string | undefined,
    mobileProjectsExpanded: {} as Record<string, boolean>,
  })

  const mobileProjects = {
    expanded: (directory: string) => store.mobileProjectsExpanded[directory] ?? true,
    expand: (directory: string) => setStore("mobileProjectsExpanded", directory, true),
    collapse: (directory: string) => setStore("mobileProjectsExpanded", directory, false),
  }

  let scrollContainerRef: HTMLDivElement | undefined
  const xlQuery = window.matchMedia("(min-width: 1280px)")
  const [isLargeViewport, setIsLargeViewport] = createSignal(xlQuery.matches)
  const handleViewportChange = (e: MediaQueryListEvent) => setIsLargeViewport(e.matches)
  xlQuery.addEventListener("change", handleViewportChange)
  onCleanup(() => xlQuery.removeEventListener("change", handleViewportChange))

  const params = useParams()
  const globalSDK = useGlobalSDK()
  const globalSync = useGlobalSync()
  const layout = useLayout()
  const platform = usePlatform()
  const server = useServer()
  const notification = useNotification()
  const permission = usePermission()
  const navigate = useNavigate()
  const providers = useProviders()
  const dialog = useDialog()
  const command = useCommand()
  const theme = useTheme()
  const availableThemeEntries = createMemo(() => Object.entries(theme.themes()))
  const colorSchemeOrder: ColorScheme[] = ["system", "light", "dark"]
  const colorSchemeLabel: Record<ColorScheme, string> = {
    system: "System",
    light: "Light",
    dark: "Dark",
  }

  function cycleTheme(direction = 1) {
    const ids = availableThemeEntries().map(([id]) => id)
    if (ids.length === 0) return
    const currentIndex = ids.indexOf(theme.themeId())
    const nextIndex = currentIndex === -1 ? 0 : (currentIndex + direction + ids.length) % ids.length
    const nextThemeId = ids[nextIndex]
    theme.setTheme(nextThemeId)
    const nextTheme = theme.themes()[nextThemeId]
    showToast({
      title: "Theme switched",
      description: nextTheme?.name ?? nextThemeId,
    })
  }

  function cycleColorScheme(direction = 1) {
    const current = theme.colorScheme()
    const currentIndex = colorSchemeOrder.indexOf(current)
    const nextIndex =
      currentIndex === -1 ? 0 : (currentIndex + direction + colorSchemeOrder.length) % colorSchemeOrder.length
    const next = colorSchemeOrder[nextIndex]
    theme.setColorScheme(next)
    showToast({
      title: "Color scheme",
      description: colorSchemeLabel[next],
    })
  }

  onMount(() => {
    if (!platform.checkUpdate || !platform.update || !platform.restart) return

    let toastId: number | undefined

    async function pollUpdate() {
      const { updateAvailable, version } = await platform.checkUpdate!
      if (updateAvailable && toastId === undefined) {
        toastId = showToast({
          persistent: true,
          icon: "download",
          title: "Update available",
          description: `A new version of OpenCode (${version}) is now available to install.`,
          actions: [
            {
              label: "Install and restart",
              onClick: async () => {
                await platform.update!()
                await platform.restart!()
              },
            },
            {
              label: "Not yet",
              onClick: "dismiss",
            },
          ],
        })
      }
    }

    pollUpdate()
    const interval = setInterval(pollUpdate, 10 * 60 * 1000)
    onCleanup(() => clearInterval(interval))
  })

  onMount(() => {
    const toastBySession = new Map<string, number>()
    const alertedAtBySession = new Map<string, number>()
    const permissionAlertCooldownMs = 5000

    const unsub = globalSDK.event.listen((e) => {
      if (e.details?.type !== "permission.asked") return
      const directory = e.name
      const perm = e.details.properties
      if (permission.autoResponds(perm)) return

      const [store] = globalSync.child(directory)
      const session = store.session.find((s) => s.id === perm.sessionID)
      const sessionKey = `${directory}:${perm.sessionID}`

      const sessionTitle = session?.title ?? "New session"
      const projectName = getFilename(directory)
      const description = `${sessionTitle} in ${projectName} needs permission`
      const href = `/${base64Encode(directory)}/session/${perm.sessionID}`

      const now = Date.now()
      const lastAlerted = alertedAtBySession.get(sessionKey) ?? 0
      if (now - lastAlerted < permissionAlertCooldownMs) return
      alertedAtBySession.set(sessionKey, now)

      void platform.notify("Permission required", description, href)

      const currentDir = params.dir ? base64Decode(params.dir) : undefined
      const currentSession = params.id
      if (directory === currentDir && perm.sessionID === currentSession) return
      if (directory === currentDir && session?.parentID === currentSession) return

      const existingToastId = toastBySession.get(sessionKey)
      if (existingToastId !== undefined) {
        toaster.dismiss(existingToastId)
      }

      const toastId = showToast({
        persistent: true,
        icon: "checklist",
        title: "Permission required",
        description,
        actions: [
          {
            label: "Go to session",
            onClick: () => {
              navigate(href)
            },
          },
          {
            label: "Dismiss",
            onClick: "dismiss",
          },
        ],
      })
      toastBySession.set(sessionKey, toastId)
    })
    onCleanup(unsub)

    createEffect(() => {
      const currentDir = params.dir ? base64Decode(params.dir) : undefined
      const currentSession = params.id
      if (!currentDir || !currentSession) return
      const sessionKey = `${currentDir}:${currentSession}`
      const toastId = toastBySession.get(sessionKey)
      if (toastId !== undefined) {
        toaster.dismiss(toastId)
        toastBySession.delete(sessionKey)
        alertedAtBySession.delete(sessionKey)
      }
      const [store] = globalSync.child(currentDir)
      const childSessions = store.session.filter((s) => s.parentID === currentSession)
      for (const child of childSessions) {
        const childKey = `${currentDir}:${child.id}`
        const childToastId = toastBySession.get(childKey)
        if (childToastId !== undefined) {
          toaster.dismiss(childToastId)
          toastBySession.delete(childKey)
          alertedAtBySession.delete(childKey)
        }
      }
    })
  })

  function sortSessions(a: Session, b: Session) {
    const now = Date.now()
    const oneMinuteAgo = now - 60 * 1000
    const aUpdated = a.time.updated ?? a.time.created
    const bUpdated = b.time.updated ?? b.time.created
    const aRecent = aUpdated > oneMinuteAgo
    const bRecent = bUpdated > oneMinuteAgo
    if (aRecent && bRecent) return a.id.localeCompare(b.id)
    if (aRecent && !bRecent) return -1
    if (!aRecent && bRecent) return 1
    return bUpdated - aUpdated
  }

  function scrollToSession(sessionId: string) {
    if (!scrollContainerRef) return
    const element = scrollContainerRef.querySelector(`[data-session-id="${sessionId}"]`)
    if (element) {
      element.scrollIntoView({ block: "nearest", behavior: "smooth" })
    }
  }

  function projectSessions(directory: string) {
    if (!directory) return []
    const sessions = globalSync.child(directory)[0].session.toSorted(sortSessions)
    return (sessions ?? []).filter((s) => !s.parentID)
  }

  const currentSessions = createMemo(() => {
    if (!params.dir) return []
    const directory = base64Decode(params.dir)
    return projectSessions(directory)
  })

  function navigateSessionByOffset(offset: number) {
    const projects = layout.projects.list()
    if (projects.length === 0) return

    const currentDirectory = params.dir ? base64Decode(params.dir) : undefined
    const projectIndex = currentDirectory ? projects.findIndex((p) => p.worktree === currentDirectory) : -1

    if (projectIndex === -1) {
      const targetProject = offset > 0 ? projects[0] : projects[projects.length - 1]
      if (targetProject) navigateToProject(targetProject.worktree)
      return
    }

    const sessions = currentSessions()
    const sessionIndex = params.id ? sessions.findIndex((s) => s.id === params.id) : -1

    let targetIndex: number
    if (sessionIndex === -1) {
      targetIndex = offset > 0 ? 0 : sessions.length - 1
    } else {
      targetIndex = sessionIndex + offset
    }

    if (targetIndex >= 0 && targetIndex < sessions.length) {
      const session = sessions[targetIndex]
      navigateToSession(session)
      queueMicrotask(() => scrollToSession(session.id))
      return
    }

    const nextProjectIndex = projectIndex + (offset > 0 ? 1 : -1)
    const nextProject = projects[nextProjectIndex]
    if (!nextProject) return

    const nextProjectSessions = projectSessions(nextProject.worktree)
    if (nextProjectSessions.length === 0) {
      navigateToProject(nextProject.worktree)
      return
    }

    const targetSession = offset > 0 ? nextProjectSessions[0] : nextProjectSessions[nextProjectSessions.length - 1]
    // For sandbox mode, use simplified URL
    if (nextProject.worktree === "global" || !nextProject.worktree) {
      navigate(`/session/${targetSession.id}`)
    } else {
      navigate(`/${base64Encode(nextProject.worktree)}/session/${targetSession.id}`)
    }
    queueMicrotask(() => scrollToSession(targetSession.id))
  }

  async function archiveSession(session: Session) {
    // Use current directory from params (handles sandbox mode where session.directory is undefined)
    const currentDir = params.dir ? base64Decode(params.dir) : session.directory
    if (!currentDir) return

    const [store] = globalSync.child(currentDir)
    const sessions = store.session ?? []
    const index = sessions.findIndex((s) => s.id === session.id)
    const nextSession = sessions[index + 1] ?? sessions[index - 1]

    // The session.updated event with archived time will automatically update all stores
    await globalSDK.client.session.update({
      directory: currentDir,
      sessionID: session.id,
      time: { archived: Date.now() },
    })

    if (session.id === params.id) {
      if (nextSession) {
        const directory = nextSession.directory || currentDir || "global"
        // For sandbox mode, use simplified URL
        if (directory === "global" || !directory) {
          navigate(`/session/${nextSession.id}`)
        } else {
          const encoded = base64Encode(directory)
          navigate(`/${encoded}/session/${nextSession.id}`)
        }
      } else {
        const directory = currentDir || "global"
        // For sandbox mode, use simplified URL
        if (directory === "global" || !directory) {
          navigate(`/session`)
        } else {
          const encoded = base64Encode(directory)
          navigate(`/${encoded}/session`)
        }
      }
    }
  }

  async function deleteSession(session: Session) {

    // SDK is used via globalSDK.client - the SDK automatically handles directory via x-opencode-directory header
    // When creating the SDK, the directory is set in the headers

    // Determine which directory to use
    const sessionDir = session.directory || "global"


    // Get the next session to navigate to (in the current view's directory)
    const currentDir = params.dir ? base64Decode(params.dir) : sessionDir
    const [store] = globalSync.child(currentDir)
    const sessions = store.session ?? []
    const index = sessions.findIndex((s) => s.id === session.id)
    const nextSession = sessions[index + 1] ?? sessions[index - 1]

    try {
      await globalSDK.client.session.delete({
        sessionID: session.id,
      })

      // Navigate away if viewing this session
      if (session.id === params.id) {
        // For sandbox mode, use simplified URL
        if (!currentDir || currentDir === "global") {
          if (nextSession) {
            navigate(`/session/${nextSession.id}`)
          } else {
            navigate(`/session`)
          }
        } else {
          const effectiveSlug = base64Encode(currentDir)
          if (nextSession) {
            navigate(`/${effectiveSlug}/session/${nextSession.id}`)
          } else {
            navigate(`/${effectiveSlug}/session`)
          }
        }
      }
    } catch (error: any) {
      // Log error silently or with internal log


      // User-friendly error message
      let userMessage = error?.message || "Unknown error"
      if (error?.status === 404) {
        userMessage = "会话不存在或已被删除。"
      } else if (error?.status === 403) {
        userMessage = "您没有权限删除此会话。"
      } else if (error?.status === 500) {
        userMessage = "服务器内部错误，请稍后重试。"
      } else if (error?.data && typeof error.data === "object") {
        const data = error.data as { error?: string }
        if (data.error) userMessage = data.error
      }

      showToast({
        title: "Failed to delete session",
        description: userMessage,
      })
      return
    }
  }

  command.register(() => {
    const commands: CommandOption[] = [
      {
        id: "sidebar.toggle",
        title: "Toggle sidebar",
        category: "View",
        keybind: "mod+b",
        onSelect: () => layout.sidebar.toggle(),
      },
      {
        id: "provider.connect",
        title: "Connect provider",
        category: "Provider",
        onSelect: () => connectProvider(),
      },
      {
        id: "server.switch",
        title: "Switch server",
        category: "Server",
        onSelect: () => openServer(),
      },
      {
        id: "session.previous",
        title: "Previous session",
        category: "Session",
        keybind: "alt+arrowup",
        onSelect: () => navigateSessionByOffset(-1),
      },
      {
        id: "session.next",
        title: "Next session",
        category: "Session",
        keybind: "alt+arrowdown",
        onSelect: () => navigateSessionByOffset(1),
      },
      {
        id: "session.archive",
        title: "Archive session",
        category: "Session",
        keybind: "mod+shift+backspace",
        disabled: !params.dir || !params.id,
        onSelect: () => {
          const session = currentSessions().find((s) => s.id === params.id)
          if (session) archiveSession(session)
        },
      },
      {
        id: "session.delete",
        title: "Delete session",
        category: "Session",
        keybind: "mod+shift+delete",
        disabled: !params.dir || !params.id,
        onSelect: () => {
          const session = currentSessions().find((s) => s.id === params.id)
          if (session) deleteSession(session)
        },
      },
      {
        id: "theme.cycle",
        title: "Cycle theme",
        category: "Theme",
        keybind: "mod+shift+t",
        onSelect: () => cycleTheme(1),
      },
    ]

    for (const [id, definition] of availableThemeEntries()) {
      commands.push({
        id: `theme.set.${id}`,
        title: `Use theme: ${definition.name ?? id}`,
        category: "Theme",
        onSelect: () => theme.commitPreview(),
        onHighlight: () => {
          theme.previewTheme(id)
          return () => theme.cancelPreview()
        },
      })
    }

    commands.push({
      id: "theme.scheme.cycle",
      title: "Cycle color scheme",
      category: "Theme",
      keybind: "mod+shift+s",
      onSelect: () => cycleColorScheme(1),
    })

    for (const scheme of colorSchemeOrder) {
      commands.push({
        id: `theme.scheme.${scheme}`,
        title: `Use color scheme: ${colorSchemeLabel[scheme]}`,
        category: "Theme",
        onSelect: () => theme.commitPreview(),
        onHighlight: () => {
          theme.previewColorScheme(scheme)
          return () => theme.cancelPreview()
        },
      })
    }

    return commands
  })

  function connectProvider() {
    dialog.show(() => <DialogSelectProvider />)
  }

  function openServer() {
    dialog.show(() => <DialogSelectServer />)
  }

  function navigateToProject(directory: string | undefined) {
    if (!directory) return
    const lastSession = store.lastSession[directory]
    navigate(`/${base64Encode(directory)}${lastSession ? `/session/${lastSession}` : ""}`)
    layout.mobileSidebar.hide()
  }

  function navigateToSession(session: Session | undefined) {
    if (!session) return
    const directory = session.directory || base64Decode(params.dir || "") || "global"
    const encoded = directory === "global" ? "global" : base64Encode(directory)
    navigate(`/${encoded}/session/${session.id}`)
    layout.mobileSidebar.hide()
  }

  function closeProject(directory: string) {
    const index = layout.projects.list().findIndex((x) => x.worktree === directory)
    const next = layout.projects.list()[index + 1]
    layout.projects.close(directory)
    if (next) navigateToProject(next.worktree)
    else navigate("/")
  }

  createEffect(() => {
    if (!params.dir || !params.id) return
    const directory = base64Decode(params.dir)
    const id = params.id
    setStore("lastSession", directory, id)
    notification.session.markViewed(id)
    untrack(() => layout.projects.expand(directory))
    requestAnimationFrame(() => scrollToSession(id))
  })

  createEffect(() => {
    if (isLargeViewport()) {
      const sidebarWidth = layout.sidebar.opened() ? layout.sidebar.width() : 48
      document.documentElement.style.setProperty("--dialog-left-margin", `${sidebarWidth}px`)
    } else {
      document.documentElement.style.setProperty("--dialog-left-margin", "0px")
    }
  })

  function getDraggableId(event: unknown): string | undefined {
    if (typeof event !== "object" || event === null) return undefined
    if (!("draggable" in event)) return undefined
    const draggable = (event as { draggable?: { id?: unknown } }).draggable
    if (!draggable) return undefined
    return typeof draggable.id === "string" ? draggable.id : undefined
  }

  function handleDragStart(event: unknown) {
    const id = getDraggableId(event)
    if (!id) return
    setStore("activeDraggable", id)
  }

  function handleDragOver(event: DragEvent) {
    const { draggable, droppable } = event
    if (draggable && droppable) {
      const projects = layout.projects.list()
      const fromIndex = projects.findIndex((p) => p.worktree === draggable.id.toString())
      const toIndex = projects.findIndex((p) => p.worktree === droppable.id.toString())
      if (fromIndex !== toIndex && toIndex !== -1) {
        layout.projects.move(draggable.id.toString(), toIndex)
      }
    }
  }

  function handleDragEnd() {
    setStore("activeDraggable", undefined)
  }

  const ProjectAvatar = (props: {
    project: LocalProject
    class?: string
    expandable?: boolean
    notify?: boolean
  }): JSX.Element => {
    const notification = useNotification()
    const notifications = createMemo(() => notification.project.unseen(props.project.worktree))
    const hasError = createMemo(() => notifications().some((n) => n.type === "error"))
    const name = createMemo(() => props.project.name || getFilename(props.project.worktree))
    const mask = "radial-gradient(circle 5px at calc(100% - 2px) 2px, transparent 5px, black 5.5px)"
    const opencode = "4b0ea68d7af9a6031a7ffda7ad66e0cb83315750"

    return (
      <div class="relative size-5 shrink-0 rounded-sm">
        <Avatar
          fallback={name()}
          src={props.project.id === opencode ? "https://opencode.ai/favicon.svg" : props.project.icon?.url}
          {...getAvatarColors(props.project.icon?.color)}
          class={`size-full ${props.class ?? ""}`}
          style={
            notifications().length > 0 && props.notify ? { "-webkit-mask-image": mask, "mask-image": mask } : undefined
          }
        />
        <Show when={props.expandable}>
          <Icon
            name="chevron-right"
            size="normal"
            class="hidden size-full items-center justify-center text-text-subtle group-hover/session:flex group-data-[expanded]/trigger:rotate-90 transition-transform duration-50"
          />
        </Show>
        <Show when={notifications().length > 0 && props.notify}>
          <div
            classList={{
              "absolute -top-0.5 -right-0.5 size-1.5 rounded-full": true,
              "bg-icon-critical-base": hasError(),
              "bg-text-interactive-base": !hasError(),
            }}
          />
        </Show>
      </div>
    )
  }

  const ProjectVisual = (props: { project: LocalProject; class?: string }): JSX.Element => {
    const name = createMemo(() => props.project.name || getFilename(props.project.worktree))
    const current = createMemo(() => base64Decode(params.dir ?? ""))
    return (
      <Switch>
        <Match when={layout.sidebar.opened()}>
          <Button
            as={"div"}
            variant="ghost"
            data-active
            data-testid="project-item"
            class="flex items-center justify-between gap-3 w-full px-1 self-stretch h-8 border-none rounded-lg"
          >
            <div class="flex items-center gap-3 p-0 text-left min-w-0 grow">
              <ProjectAvatar project={props.project} />
              <span class="truncate text-14-medium text-text-strong">{name()}</span>
            </div>
          </Button>
        </Match>
        <Match when={true}>
          <Button
            variant="ghost"
            size="large"
            data-testid="project-item"
            class="flex items-center justify-center p-0 aspect-square border-none rounded-lg"
            data-selected={props.project.worktree === current()}
            onClick={() => navigateToProject(props.project.worktree)}
          >
            <ProjectAvatar project={props.project} notify />
          </Button>
        </Match>
      </Switch>
    )
  }

  const SessionItem = (props: {
    session: Session
    slug: string
    project?: LocalProject
    mobile?: boolean
  }): JSX.Element => {
    const notification = useNotification()
    const updated = createMemo(() => DateTime.fromMillis(props.session.time.updated))
    const notifications = createMemo(() => notification.session.unseen(props.session.id))
    const hasError = createMemo(() => notifications().some((n) => n.type === "error"))
    const globalStore = globalSync.data
    const [sessionStore] = globalSync.child(props.session.directory || globalStore.path.directory || "global")
    const hasPermissions = createMemo(() => {
      const permissions = sessionStore.permission?.[props.session.id] ?? []
      if (permissions.length > 0) return true
      const childSessions = sessionStore.session.filter((s) => s.parentID === props.session.id)
      for (const child of childSessions) {
        const childPermissions = sessionStore.permission?.[child.id] ?? []
        if (childPermissions.length > 0) return true
      }
      return false
    })
    const isWorking = createMemo(() => {
      if (props.session.id === params.id) return false
      if (hasPermissions()) return false
      const status = sessionStore.session_status[props.session.id]
      return status?.type === "busy" || status?.type === "retry"
    })
    return (
      <>
        <div
          data-session-id={props.session.id}
          data-testid="session-item"
          class="group/session relative w-full rounded-md cursor-default transition-colors
                 hover:bg-surface-raised-base-hover focus-within:bg-surface-raised-base-hover has-[.active]:bg-surface-raised-base-hover"
        >
          <Tooltip placement={props.mobile ? "bottom" : "right"} value={props.session.title} gutter={10}>
            <A
              href={`${props.slug}/session/${props.session.id}`}
              class="flex flex-col min-w-0 text-left w-full focus:outline-none pl-4 pr-2 py-1"
            >
              <div class="flex items-center self-stretch gap-6 justify-between transition-[padding] group-hover/session:pr-7 group-focus-within/session:pr-7 group-active/session:pr-7">
                <span
                  classList={{
                    "text-14-regular text-text-strong overflow-hidden text-ellipsis truncate": true,
                    "animate-pulse": isWorking(),
                  }}
                >
                  {props.session.title}
                </span>
                <div class="shrink-0 group-hover/session:hidden group-active/session:hidden group-focus-within/session:hidden">
                  <Switch>
                    <Match when={isWorking()}>
                      <Spinner class="size-2.5 mr-0.5" />
                    </Match>
                    <Match when={hasPermissions()}>
                      <div class="size-1.5 mr-1.5 rounded-full bg-surface-warning-strong" />
                    </Match>
                    <Match when={hasError()}>
                      <div class="size-1.5 mr-1.5 rounded-full bg-text-diff-delete-base" />
                    </Match>
                    <Match when={notifications().length > 0}>
                      <div class="size-1.5 mr-1.5 rounded-full bg-text-interactive-base" />
                    </Match>
                    <Match when={true}>
                      <span class="text-12-regular text-text-weak text-right whitespace-nowrap">
                        {Math.abs(updated().diffNow().as("seconds")) < 60
                          ? "Now"
                          : updated()
                              .toRelative({
                                style: "short",
                                unit: ["days", "hours", "minutes"],
                              })
                              ?.replace(" ago", "")
                              ?.replace(/ days?/, "d")
                              ?.replace(" min.", "m")
                              ?.replace(" hr.", "h")}
                      </span>
                    </Match>
                  </Switch>
                </div>
              </div>
              <Show when={props.session.summary?.files}>
                <div class="flex justify-between items-center self-stretch">
                  <span class="text-12-regular text-text-weak">{`${props.session.summary?.files || "No"} file${props.session.summary?.files !== 1 ? "s" : ""} changed`}</span>
                  <Show when={props.session.summary}>{(summary) => <DiffChanges changes={summary()} />}</Show>
                </div>
              </Show>
            </A>
          </Tooltip>
          <div class="hidden group-hover/session:flex group-active/session:flex group-focus-within/session:flex text-text-base gap-1 items-center absolute top-1 right-1">
            <TooltipKeybind
              placement={props.mobile ? "bottom" : "right"}
              title="Archive session"
              keybind={command.keybind("session.archive")}
            >
              <IconButton icon="archive" variant="ghost" onClick={() => archiveSession(props.session)} />
            </TooltipKeybind>
            <TooltipKeybind
              placement={props.mobile ? "bottom" : "right"}
              title="Delete session"
              keybind={command.keybind("session.delete")}
            >
              <IconButton icon="trash" variant="ghost" onClick={() => deleteSession(props.session)} />
            </TooltipKeybind>
          </div>
        </div>
      </>
    )
  }

  const SortableProject = (props: { project: LocalProject; mobile?: boolean }): JSX.Element => {
    const sortable = createSortable(props.project.worktree)
    const showExpanded = createMemo(() => props.mobile || layout.sidebar.opened())
    const defaultWorktree = createMemo(() => base64Encode(props.project.worktree))
    const name = createMemo(() => props.project.name || getFilename(props.project.worktree))
    const [store, setProjectStore] = globalSync.child(props.project.worktree)
    const stores = createMemo(() =>
      [props.project.worktree, ...(props.project.sandboxes ?? [])].map((dir) => globalSync.child(dir)[0]),
    )
    const sessions = createMemo(() =>
      stores()
        .flatMap((store) =>
          store.session.filter((session) => {
            // In sandbox mode, session.directory is undefined, so include all sessions
            // Otherwise, match by directory
            return !session.directory || session.directory === store.path.directory
          }),
        )
        .toSorted(sortSessions),
    )
    const rootSessions = createMemo(() => sessions().filter((s) => s.parentID === undefined))
    const hasMoreSessions = createMemo(() => store.session.length >= store.limit)
    const loadMoreSessions = async () => {
      setProjectStore("limit", (limit) => limit + 5)
      await globalSync.project.loadSessions(props.project.worktree)
    }
    const isExpanded = createMemo(() =>
      props.mobile ? mobileProjects.expanded(props.project.worktree) : props.project.expanded,
    )
    const isActive = createMemo(() => {
      const current = params.dir ? base64Decode(params.dir) : ""
      return props.project.worktree === current || props.project.sandboxes?.includes(current)
    })
    const handleOpenChange = (open: boolean) => {
      if (props.mobile) {
        if (open) mobileProjects.expand(props.project.worktree)
        else mobileProjects.collapse(props.project.worktree)
      } else {
        if (open) layout.projects.expand(props.project.worktree)
        else layout.projects.collapse(props.project.worktree)
      }
    }
    return (
      // @ts-ignore
      <div use:sortable classList={{ "opacity-30": sortable.isActiveDraggable }}>
        <Switch>
          <Match when={showExpanded()}>
            <Collapsible variant="ghost" open={isExpanded()} class="gap-2 shrink-0" onOpenChange={handleOpenChange}>
              <Button
                as={"div"}
                variant="ghost"
                classList={{
                  "group/session flex items-center justify-between gap-3 w-full px-1.5 self-stretch h-auto border-none rounded-lg": true,
                  "bg-surface-raised-base-hover": isActive() && !isExpanded(),
                }}
              >
                <Collapsible.Trigger class="group/trigger flex items-center gap-3 p-0 text-left min-w-0 grow border-none">
                  <ProjectAvatar
                    project={props.project}
                    class="group-hover/session:hidden"
                    expandable
                    notify={!isExpanded()}
                  />
                  <span class="truncate text-14-medium text-text-strong">{name()}</span>
                </Collapsible.Trigger>
                <div class="flex invisible gap-1 items-center group-hover/session:visible has-[[data-expanded]]:visible">
                  <DropdownMenu>
                    <DropdownMenu.Trigger as={IconButton} icon="dot-grid" variant="ghost" />
                    <DropdownMenu.Portal>
                      <DropdownMenu.Content>
                        <DropdownMenu.Item
                          onSelect={() => dialog.show(() => <DialogEditProject project={props.project} />)}
                        >
                          <DropdownMenu.ItemLabel>Edit project</DropdownMenu.ItemLabel>
                        </DropdownMenu.Item>
                        <DropdownMenu.Item onSelect={() => closeProject(props.project.worktree)}>
                          <DropdownMenu.ItemLabel>Close project</DropdownMenu.ItemLabel>
                        </DropdownMenu.Item>
                      </DropdownMenu.Content>
                    </DropdownMenu.Portal>
                  </DropdownMenu>
                  <TooltipKeybind placement="top" title="New session" keybind={command.keybind("session.new")}>
                    <IconButton as={A} href={`${defaultWorktree()}/session`} icon="plus-small" variant="ghost" />
                  </TooltipKeybind>
                </div>
              </Button>
              <Collapsible.Content>
                <nav class="hidden @[4rem]:flex w-full flex-col gap-1.5">
                  <For each={rootSessions()}>
                    {(session) => (
                      <SessionItem
                        session={session}
                        slug={base64Encode(session.directory || props.project.worktree)}
                        project={props.project}
                        mobile={props.mobile}
                      />
                    )}
                  </For>
                  <Show when={rootSessions().length === 0}>
                    <div
                      class="group/session relative w-full pl-4 pr-2 py-1 rounded-md cursor-default transition-colors
                             hover:bg-surface-raised-base-hover focus-within:bg-surface-raised-base-hover has-[.active]:bg-surface-raised-base-hover"
                    >
                      <div class="flex items-center self-stretch w-full">
                        <div class="flex-1 min-w-0">
                          <Tooltip placement={props.mobile ? "bottom" : "right"} value="New session">
                            <A
                              href={`${defaultWorktree()}/session`}
                              class="flex flex-col gap-1 min-w-0 text-left w-full focus:outline-none"
                            >
                              <div class="flex items-center self-stretch gap-6 justify-between">
                                <span class="text-14-regular text-text-strong overflow-hidden text-ellipsis truncate">
                                  New session
                                </span>
                              </div>
                            </A>
                          </Tooltip>
                        </div>
                      </div>
                    </div>
                  </Show>
                  <Show when={hasMoreSessions()}>
                    <div class="relative w-full py-1">
                      <Button
                        variant="ghost"
                        class="flex w-full text-left justify-start text-12-medium opacity-50 px-3.5"
                        size="large"
                        onClick={loadMoreSessions}
                      >
                        Load more
                      </Button>
                    </div>
                  </Show>
                </nav>
              </Collapsible.Content>
            </Collapsible>
          </Match>
          <Match when={true}>
            <Tooltip placement="right" value={props.project.worktree}>
              <ProjectVisual project={props.project} />
            </Tooltip>
          </Match>
        </Switch>
      </div>
    )
  }

  const ProjectDragOverlay = (): JSX.Element => {
    const project = createMemo(() => layout.projects.list().find((p) => p.worktree === store.activeDraggable))
    return (
      <Show when={project()}>
        {(p) => (
          <div class="bg-background-base rounded-md">
            <ProjectVisual project={p()} />
          </div>
        )}
      </Show>
    )
  }

  const SidebarContent = (sidebarProps: { mobile?: boolean }) => {
    const expanded = () => sidebarProps.mobile || layout.sidebar.opened()
    const navigate = useNavigate()
    const globalSync = useGlobalSync()
    const globalStore = globalSync.data
    const currentChild = globalSync.child(globalStore.path.directory || "global")
    const [childStore] = currentChild
    const sortedSessions = createMemo(() => childStore.session.filter((s) => s.parentID === undefined))
    return (
      <div class="flex flex-col self-stretch h-full items-center justify-between overflow-hidden min-h-0">
        <div class="flex flex-col items-start self-stretch gap-4 min-h-0">
          <Show when={!sidebarProps.mobile}>
            <div
              classList={{
                "border-b border-border-weak-base w-full h-12 ml-px flex items-center pl-1.75 shrink-0": true,
                "justify-start": expanded(),
              }}
            >
              <A href="/" class="shrink-0 h-8 flex items-center justify-start px-2 w-full" data-tauri-drag-region>
                <Mark class="shrink-0" />
              </A>
            </div>
          </Show>
          <div class="flex flex-col items-start self-stretch gap-4 px-2 overflow-hidden min-h-0">
            <Show when={!sidebarProps.mobile}>
              <TooltipKeybind
                class="shrink-0"
                placement="right"
                title="Toggle sidebar"
                keybind={command.keybind("sidebar.toggle")}
                inactive={expanded()}
              >
                <Button
                  variant="ghost"
                  size="large"
                  class="group/sidebar-toggle shrink-0 w-full text-left justify-start rounded-lg px-2"
                  onClick={layout.sidebar.toggle}
                >
                  <div class="relative -ml-px flex items-center justify-center size-4 [&>*]:absolute [&>*]:inset-0">
                    <Icon
                      name={layout.sidebar.opened() ? "layout-left" : "layout-right"}
                      size="small"
                      class="group-hover/sidebar-toggle:hidden"
                    />
                    <Icon
                      name={layout.sidebar.opened() ? "layout-left-partial" : "layout-right-partial"}
                      size="small"
                      class="hidden group-hover/sidebar-toggle:inline-block"
                    />
                    <Icon
                      name={layout.sidebar.opened() ? "layout-left-full" : "layout-right-full"}
                      size="small"
                      class="hidden group-active/sidebar-toggle:inline-block"
                    />
                  </div>
                  <Show when={layout.sidebar.opened()}>
                    <div class="hidden group-hover/sidebar-toggle:block group-active/sidebar-toggle:block text-text-base">
                      Toggle sidebar
                    </div>
                  </Show>
                </Button>
              </TooltipKeybind>
              <TooltipKeybind
                placement="right"
                title="New conversation"
                keybind={command.keybind("session.new")}
                inactive={expanded()}
              >
                <Button
                  as={A}
                  href={params.dir ? `/${params.dir}/session` : "/global/session"}
                  class="shrink-0 w-full text-left justify-start text-text-base stroke-[1.5px] rounded-lg px-2"
                  variant="ghost"
                  size="large"
                  icon="plus"
                  data-testid="create-session-button"
                >
                  <Show when={layout.sidebar.opened()}>New conversation</Show>
                </Button>
              </TooltipKeybind>
            </Show>
            <div
              ref={(el) => {
                if (!sidebarProps.mobile) scrollContainerRef = el
              }}
              class="w-full min-w-8 flex flex-col min-h-0 overflow-y-auto no-scrollbar"
            >
              <Show
                when={sortedSessions().length > 0}
                fallback={
                  <div class="flex flex-col items-center justify-center h-full text-text-weak px-6 py-8">
                    <Icon name="bubble-5" size="normal" class="mb-3 opacity-50" />
                    <p class="text-14-medium">暂无会话</p>
                  </div>
                }
              >
                <div class="py-2 space-y-0.5">
                  <For each={sortedSessions()}>
                    {(session) => {
                      const directory = session.directory || (params.dir ? base64Decode(params.dir) : "global")
                      const slug = directory === "global" ? "global" : base64Encode(directory)
                      return <SessionItem session={session} slug={slug} />
                    }}
                  </For>
                </div>
              </Show>
            </div>
          </div>
        </div>
        <div class="flex flex-col gap-1.5 self-stretch items-start shrink-0">
          <Switch>
            <Match when={providers.all().length > 0 && !providers.paid().length && expanded()}>
              <div class="rounded-md bg-background-stronger shadow-xs-border-base">
                <div class="p-3 flex flex-col gap-2">
                  <div class="text-12-medium text-text-strong">Getting started</div>
                  <div class="text-text-base">OpenCode includes free models so you can start immediately.</div>
                  <div class="text-text-base">Connect any provider to use models, inc. Claude, GPT, Gemini etc.</div>
                </div>
                <Tooltip placement="right" value="Connect provider" inactive={expanded()}>
                  <Button
                    class="flex w-full text-left justify-start text-12-medium text-text-strong stroke-[1.5px] rounded-lg rounded-t-none shadow-none border-t border-border-weak-base pl-2.25 pb-px"
                    size="large"
                    icon="plus"
                    onClick={connectProvider}
                  >
                    Connect provider
                  </Button>
                </Tooltip>
              </div>
            </Match>
            <Match when={providers.all().length > 0}>
              <Tooltip placement="right" value="Connect provider" inactive={expanded()}>
                <Button
                  class="flex w-full text-left justify-start text-text-base stroke-[1.5px] rounded-lg px-2"
                  variant="ghost"
                  size="large"
                  icon="plus"
                  onClick={connectProvider}
                >
                  <Show when={expanded()}>Connect provider</Show>
                </Button>
              </Tooltip>
            </Match>
          </Switch>

          <Show when={layout.sidebar.opened()}>
            <TooltipKeybind placement="right" title="Scheduler" keybind="mod+shift+s" inactive={expanded()}>
              <Button
                class="flex w-full text-left justify-start text-text-base stroke-[1.5px] rounded-lg px-2"
                variant="ghost"
                size="large"
                icon="task"
                onClick={layout.scheduler.toggle}
              >
                <Show when={expanded()}>定时任务</Show>
              </Button>
            </TooltipKeybind>
          </Show>
        </div>
      </div>
    )
  }

  return (
    <div class="relative flex-1 min-h-0 flex flex-col select-none [&_input]:select-text [&_textarea]:select-text [&_[contenteditable]]:select-text">
      <div data-testid="connection-status" class="fixed bottom-0 left-0 w-px h-px opacity-0 pointer-events-none overflow-hidden" aria-hidden="true">
        {server.healthy() ? "connected" : "connecting"}
      </div>
      <div class="flex-1 min-h-0 flex">
        <div
          classList={{
            "hidden xl:block": true,
            "relative shrink-0": true,
          }}
          style={{ width: layout.sidebar.opened() ? `${layout.sidebar.width()}px` : "48px" }}
        >
          <div
            data-component="sidebar-nav"
            classList={{
              "@container w-full h-full pb-5 bg-background-base": true,
              "flex flex-col gap-5.5 items-start self-stretch justify-between": true,
              "border-r border-border-weak-base contain-strict": true,
            }}
          >
            <SidebarContent />
          </div>
          <Show when={layout.sidebar.opened()}>
            <ResizeHandle
              direction="horizontal"
              size={layout.sidebar.width()}
              min={150}
              max={window.innerWidth * 0.3}
              collapseThreshold={80}
              onResize={layout.sidebar.resize}
              onCollapse={layout.sidebar.close}
            />
          </Show>
        </div>
        <div class="xl:hidden">
          <div
            classList={{
              "fixed inset-0 bg-black/50 z-40 transition-opacity duration-200": true,
              "opacity-100 pointer-events-auto": layout.mobileSidebar.opened(),
              "opacity-0 pointer-events-none": !layout.mobileSidebar.opened(),
            }}
            onClick={(e) => {
              if (e.target === e.currentTarget) layout.mobileSidebar.hide()
            }}
          />
          <div
            classList={{
              "@container fixed inset-y-0 left-0 z-50 w-72 bg-background-base border-r border-border-weak-base flex flex-col gap-5.5 items-start self-stretch justify-between pb-5 transition-transform duration-200 ease-out": true,
              "translate-x-0": layout.mobileSidebar.opened(),
              "-translate-x-full": !layout.mobileSidebar.opened(),
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div class="border-b border-border-weak-base w-full h-12 ml-px flex items-center pl-1.75 shrink-0">
              <A
                href="/"
                class="shrink-0 h-8 flex items-center justify-start px-2 w-full"
                onClick={() => layout.mobileSidebar.hide()}
              >
                <Mark class="shrink-0" />
              </A>
            </div>
            <SidebarContent mobile />
          </div>
        </div>

        <main class="size-full overflow-x-hidden flex flex-col items-stretch min-w-0">
          {props.children}
        </main>
      </div>
      <Toast.Region />
    </div>
  )
}
