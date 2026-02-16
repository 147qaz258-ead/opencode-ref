import { Show } from "solid-js"
import { VNCViewer } from "@/components/VNCViewer"

interface VNCRendererProps {
  sessionId: string
  vncUrl: string
}

export function VNCRenderer(props: VNCRendererProps) {
  return (
    <VNCViewer
      sessionId={props.sessionId}
      vncUrl={() => props.vncUrl}
      width={800}
      height={600}
    />
  )
}