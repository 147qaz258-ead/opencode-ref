import { createSignal, onMount, onCleanup, For, Show, createEffect } from "solid-js"
import { Icon } from "@opencode-ai/ui/icon"
import type { MonitorAction } from "@/hooks/useMonitor"
import { ImageRenderer } from "./renderers/ImageRenderer"

interface InfiniteCanvasProps {
  sessionId: string
  history: MonitorAction[]
}

interface NodePosition {
  id: string
  x: number
  y: number
  selected: boolean
  zIndex: number
}

export function InfiniteCanvas(props: InfiniteCanvasProps) {
  // Canvas State
  const [scale, setScale] = createSignal(1)
  const [pan, setPan] = createSignal({ x: -100, y: -100 })
  const [nodes, setNodes] = createSignal<NodePosition[]>([])
  
  // Selection State
  const [selectionBox, setSelectionBox] = createSignal<{ x: number, y: number, w: number, h: number } | null>(null)
  const [isSelecting, setIsSelecting] = createSignal(false)
  
  // Interaction State
  let containerRef: HTMLDivElement | undefined
  let isPanning = false
  let isDraggingNode = false
  let startPos = { x: 0, y: 0 }
  let draggedNodeId: string | null = null
  let nodeOffset = { x: 0, y: 0 }
  let maxZIndex = 1

  // Initialize nodes from history
  // In a real app, we might want to layout them intelligently or persist positions.
  // For now, simple scatter layout.
  const initNodesFromHistory = () => {
    const currentNodes = nodes()
    const historyImages = props.history.filter(h => h.renderType === 'image')
    
    // Add new nodes
    const newNodes = historyImages
      .filter(h => !currentNodes.find(n => n.id === h.id))
      .map((h, i) => ({
        id: h.id,
        x: i * 50 + 100, // Staircase layout
        y: i * 50 + 100,
        selected: false,
        zIndex: 1
      }))

    if (newNodes.length > 0) {
      setNodes([...currentNodes, ...newNodes])
    }
  }

  // React to history changes
  createSignal(props.history) // Track dependency?
  // Actually simpler: just re-run init when props.history length changes
  // But SolidJS tracking is fine.
  
  // We use an effect to sync history to nodes
  // Note: createEffect tracks dependencies automatically.
  createEffect(() => {
    initNodesFromHistory()
  })

  // --- TRANSFORMS ---
  const screenToWorld = (sx: number, sy: number) => {
    return {
      x: (sx - pan().x) / scale(),
      y: (sy - pan().y) / scale()
    }
  }

  // --- MOUSE HANDLERS ---
  const handleWheel = (e: WheelEvent) => {
    e.preventDefault()
    const delta = -e.deltaY * 0.001
    const newScale = Math.min(Math.max(0.1, scale() + delta), 5)
    setScale(newScale)
  }

  const handleMouseDown = (e: MouseEvent) => {
    // 1. Check Node Drag
    const target = e.target as HTMLElement
    const nodeHeader = target.closest('.node-header')
    
    if (nodeHeader) {
      if (e.button !== 0) return
      e.stopPropagation()
      
      const nodeEl = target.closest('.node') as HTMLElement
      const id = nodeEl.dataset.id!
      
      isDraggingNode = true
      draggedNodeId = id
      
      // Select & Bring to Front
      setNodes(prev => prev.map(n => ({
        ...n,
        selected: n.id === id,
        zIndex: n.id === id ? ++maxZIndex : n.zIndex
      })))
      
      // Calculate Offset
      const rect = nodeEl.getBoundingClientRect()
      nodeOffset = {
        x: (e.clientX - rect.left) / scale(),
        y: (e.clientY - rect.top) / scale()
      }
      return
    }

    // 2. Pan (Middle/Right/Space)
    if (e.button === 1 || e.button === 2 || (e.button === 0 && e.getModifierState("Space"))) {
      isPanning = true
      startPos = { x: e.clientX - pan().x, y: e.clientY - pan().y }
      // containerRef.style.cursor = 'grabbing'
      return
    }

    // 3. Selection (Left on Background)
    if (e.button === 0) {
      setIsSelecting(true)
      startPos = { x: e.clientX, y: e.clientY }
      setSelectionBox({ x: e.clientX, y: e.clientY, w: 0, h: 0 })
      
      // Clear selection
      setNodes(prev => prev.map(n => ({ ...n, selected: false })))
    }
  }

  const handleMouseMove = (e: MouseEvent) => {
    if (isPanning) {
      setPan({
        x: e.clientX - startPos.x,
        y: e.clientY - startPos.y
      })
    }

    if (isDraggingNode && draggedNodeId) {
      const worldPos = screenToWorld(e.clientX, e.clientY)
      setNodes(prev => prev.map(n => 
        n.id === draggedNodeId ? { ...n, x: worldPos.x - nodeOffset.x, y: worldPos.y - nodeOffset.y } : n
      ))
    }

    if (isSelecting() && selectionBox()) {
      const currentX = e.clientX
      const currentY = e.clientY
      
      const w = Math.abs(currentX - startPos.x)
      const h = Math.abs(currentY - startPos.y)
      const x = Math.min(currentX, startPos.x)
      const y = Math.min(currentY, startPos.y)
      
      setSelectionBox({ x, y, w, h })
      
      // Collision Detection (Simplified)
      // Note: Real collision needs screen coordinates of nodes. 
      // We skip exact collision for this MVP or assume nodes are roughly where they should be.
      // Implementing full collision in SolidJS logic is a bit verbose, 
      // but we can do a simple check against node positions transformed to screen.
      
      // Update Selection
       setNodes(prev => prev.map(n => {
         // Convert node world pos to screen
         const nsx = n.x * scale() + pan().x
         const nsy = n.y * scale() + pan().y
         // Assume node size ~ 300x200
         const nsw = 300 * scale()
         const nsh = 200 * scale()
         
         const intersect = !(nsx + nsw < x || nsx > x + w || nsy + nsh < y || nsy > y + h)
         return { ...n, selected: intersect }
       }))
    }
  }

  const handleMouseUp = () => {
    isPanning = false
    isDraggingNode = false
    draggedNodeId = null
    setIsSelecting(false)
    setSelectionBox(null)
  }

  // Bind Events cleanly
  // Note: SolidJS 'use:___' directives are clean but sticking to ref logic is fine
  
  return (
    <div 
      ref={containerRef}
      class="w-full h-full relative overflow-hidden bg-[#f9fafb] cursor-default select-none" // Light background
      onWheel={handleWheel}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      onContextMenu={e => e.preventDefault()}
    >
      {/* Infinite Grid Background */}
      <div 
        class="absolute top-0 left-0 w-full h-full pointer-events-none"
        style={{
          "background-image": `linear-gradient(#e5e7eb 1px, transparent 1px), linear-gradient(90deg, #e5e7eb 1px, transparent 1px)`, // Light grid
          "background-size": `${50 * scale()}px ${50 * scale()}px`,
          "background-position": `${pan().x}px ${pan().y}px`,
          "opacity": 0.8
        }}
      />

      {/* World Container */}
      <div 
        style={{
          transform: `translate(${pan().x}px, ${pan().y}px) scale(${scale()})`,
          "transform-origin": "0 0",
          "width": "100%", "height": "100%",
          "position": "absolute", "top": 0, "left": 0
        }}
      >
        <For each={nodes()}>
          {node => {
             const action = props.history.find(h => h.id === node.id)
             if (!action) return null
             
             return (
               <div
                 class={`absolute flex flex-col bg-white border rounded-xl overflow-hidden shadow-lg transition-shadow duration-200 node`}
                 classList={{
                   'border-blue-500 shadow-[0_0_0_2px_rgba(59,130,246,0.5)]': node.selected,
                   'border-border-base': !node.selected
                 }}
                 style={{
                   left: `${node.x}px`,
                   top: `${node.y}px`,
                   width: '320px',
                   "z-index": node.zIndex
                 }}
                 data-id={node.id}
               >
                 <div class="flex items-center justify-between px-3 py-2 bg-gray-50 border-b border-border-weak cursor-grab active:cursor-grabbing node-header">
                   <span class="text-12-medium text-text-strong truncate">Generated Image</span>
                   <div class="flex gap-2">
                     {/* Actions like Download/Delete could go here */}
                   </div>
                 </div>
                 <div class="h-[240px] bg-gray-100 relative flex items-center justify-center">
                   <ImageRenderer 
                     sessionId={props.sessionId} 
                     filePath={action.data.filePath || ''} 
                     src={action.data.src}
                   />
                 </div>
               </div>
             )
          }}
        </For>
      </div>

      {/* Selection Marquee */}
      <Show when={selectionBox()}>
        <div 
          class="absolute border border-blue-500/50 bg-blue-500/10 pointer-events-none z-[9999]"
          style={{
            left: `${selectionBox()?.x}px`,
            top: `${selectionBox()?.y}px`,
            width: `${selectionBox()?.w}px`,
            height: `${selectionBox()?.h}px`
          }}
        />
      </Show>

      {/* Controls HUD */}
      <div class="absolute bottom-4 right-4 flex gap-2 pointer-events-none">
        <div class="px-3 py-1.5 bg-white/90 backdrop-blur rounded-lg border border-border-base shadow-sm text-text-secondary text-12-regular">
          Left Drag: Select • Middle/Right: Pan • Scroll: Zoom
        </div>
      </div>
    </div>
  )
}
