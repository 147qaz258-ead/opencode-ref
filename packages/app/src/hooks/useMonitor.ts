import { createSignal, onMount } from "solid-js"
import { useLayout } from "@/context/layout"

export interface MonitorAction {
  id: string
  timestamp: number
  renderType: "vnc" | "markdown" | "code" | "image" | "video"
  data: {
    vncUrl?: string
    filePath?: string
    content?: string  // Optional: passed from SSE event, but NOT stored in persistence
    language?: string
    src?: string
  }
}

export function useMonitor(sessionId: () => string) {
  const layout = useLayout()
  const sid = () => sessionId()

  // Load persisted index from layout store on mount
  const [history, setHistory] = createSignal<MonitorAction[]>([])
  const [currentIndex, setCurrentIndex] = createSignal(0)
  const [isOpen, setIsOpen] = createSignal(false)
  const [width, setWidth] = createSignal(400)

  // Load from persisted store on mount
  onMount(() => {
    try {
      const stored = layout.monitorContent(sid()).get()
      if (stored && stored.actions.length > 0) {
        // Convert persisted index to MonitorAction (without content)
        setHistory(stored.actions.map(index => ({
          id: index.id,
          timestamp: index.timestamp,
          renderType: index.renderType,
          data: {
            ...index.data,
            // Content is NOT persisted - will be loaded from sandbox on render
          },
        })))
        setCurrentIndex(stored.currentIndex ?? 0)
      }
    } catch (error) {
      console.error("Failed to load monitor content from store:", error)
    }
  })

  const currentAction = () => history()[currentIndex()]
  const canGoBack = () => currentIndex() > 0
  const canGoForward = () => currentIndex() < history().length - 1

  const addAction = (action: MonitorAction) => {
    setHistory((prev) => [...prev, action])
    const newLength = history().length
    setCurrentIndex(newLength - 1)

    // Sync to persisted store (lightweight index without content)
    try {
      const indexAction = {
        id: action.id,
        timestamp: action.timestamp,
        renderType: action.renderType,
        data: {
          vncUrl: action.data.vncUrl,
          filePath: action.data.filePath,
          language: action.data.language,
        },
      }
      layout.monitorContent(sid()).addAction(indexAction)
    } catch (error) {
      console.error("Failed to persist monitor action:", error)
    }

    if (newLength === 1 && ["image", "video", "vnc"].includes(action.renderType)) {
      setIsOpen(true)
    }
  }

  const goBack = () => {
    const newIndex = Math.max(0, currentIndex() - 1)
    setCurrentIndex(newIndex)
    try {
      layout.monitorContent(sid()).setCurrentIndex(newIndex)
    } catch (error) {
      console.error("Failed to persist monitor index:", error)
    }
  }

  const goForward = () => {
    const newIndex = Math.min(history().length - 1, currentIndex() + 1)
    setCurrentIndex(newIndex)
    try {
      layout.monitorContent(sid()).setCurrentIndex(newIndex)
    } catch (error) {
      console.error("Failed to persist monitor index:", error)
    }
  }

  const clear = () => {
    setHistory([])
    setCurrentIndex(0)
    setIsOpen(false)
    try {
      layout.monitorContent(sid()).clear()
    } catch (error) {
      console.error("Failed to clear monitor content:", error)
    }
  }

  return {
    history,
    currentIndex,
    currentAction,
    isOpen,
    width,
    setIsOpen,
    setWidth,
    addAction,
    goBack,
    goForward,
    clear,
    canGoBack,
    canGoForward,
    count: () => history().length,
  }
}
