export const promptSelector = '[data-component="prompt-input"]'
export const connectionStatusSelector = '[data-testid="connection-status"]'
export const sessionIDSelector = '[data-testid="session-id"]'
export const messageInputSelector = '[data-testid="message-input"]'
export const sendButtonSelector = '[data-testid="send-button"]'
export const createSessionButtonSelector = '[data-testid="create-session-button"]'

export const sidebarNavSelector = '[data-component="sidebar-nav"]'
export const projectItemSelector = '[data-testid="project-item"]'
export const sessionItemSelector = (sessionID: string) => `[data-session-id="${sessionID}"]`

export const popoverBodySelector = '[data-slot="popover-body"]'
export const dropdownMenuContentSelector = '[data-component="dropdown-menu-content"]'
export const dialogOverlaySelector = '[data-component="dialog-overlay"]'

export const messagePartSelector = '[data-testid="message-part"]'
export const messageContentSelector = '[data-testid="message-content"]'
export const errorMessageSelector = '[data-testid="error-message"]'
