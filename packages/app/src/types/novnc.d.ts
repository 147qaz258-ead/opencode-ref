declare module "@novnc/novnc" {
    export default class RFB {
        constructor(
            target: HTMLElement,
            url: string,
            options?: {
                credentials?: { password?: string }
                shared?: boolean
                wsProtocols?: string[]
            }
        )

        scaleViewport: boolean
        resizeSession: boolean

        addEventListener(event: string, callback: (e?: any) => void): void
        removeEventListener(event: string, callback: (e?: any) => void): void
        disconnect(): void
        sendCredentials(credentials: { password?: string }): void
        sendCtrlAltDel(): void
    }
}
