import "@/index.css"
import { ErrorBoundary, Show, onMount, type ParentProps } from "solid-js"
import { Router, Route, Navigate } from "@solidjs/router"
import { MetaProvider } from "@solidjs/meta"
import { Font } from "@opencode-ai/ui/font"
import { MarkedProvider } from "@opencode-ai/ui/context/marked"
import { DiffComponentProvider } from "@opencode-ai/ui/context/diff"
import { CodeComponentProvider } from "@opencode-ai/ui/context/code"
import { Diff } from "@opencode-ai/ui/diff"
import { Code } from "@opencode-ai/ui/code"
import { ThemeProvider } from "@opencode-ai/ui/theme"
import { AuthProvider } from "@/context/auth"
import { GlobalSyncProvider } from "@/context/global-sync"
import { PermissionProvider } from "@/context/permission"
import { LayoutProvider } from "@/context/layout"
import { GlobalSDKProvider } from "@/context/global-sdk"
import { ServerProvider, useServer } from "@/context/server"
import { SDKProvider } from "@/context/sdk"
import { TerminalProvider } from "@/context/terminal"
import { PromptProvider } from "@/context/prompt"
import { FileProvider } from "@/context/file"
import { NotificationProvider } from "@/context/notification"
import { DialogProvider } from "@opencode-ai/ui/context/dialog"
import { CommandProvider } from "@/context/command"
import { SkillProvider } from "@/context/skill"
import Layout from "@/pages/layout"
import SchedulePage from "@/pages/schedule"

import LandingPage from "@/pages/landing"
import Hero from "@/pages/hero"
import DirectoryLayout from "@/pages/directory-layout"
import Session from "@/pages/session"
import SkillsPage from "@/pages/skills"
import SkillDetailPage from "@/pages/skill-detail"
import LoginPage from "@/pages/login"
import LoginCallbackPage from "@/pages/login-callback"
import { ErrorPage } from "./pages/error"
import { iife } from "@opencode-ai/util/iife"

declare global {
  interface Window {
    __OPENCODE__?: { updaterEnabled?: boolean; port?: number }
  }
}

const defaultServerUrl = iife(() => {
  const param = new URLSearchParams(document.location.search).get("url")
  if (param) return param

  if (location.hostname.includes("opencode.ai")) return "http://localhost:4096"
  if (window.__OPENCODE__) return `http://127.0.0.1:${window.__OPENCODE__.port}`
  if (import.meta.env.DEV)
    return `http://${import.meta.env.VITE_OPENCODE_SERVER_HOST ?? "localhost"}:${import.meta.env.VITE_OPENCODE_SERVER_PORT ?? "4096"}`

  return window.location.origin
})

function ServerKey(props: ParentProps) {
  const server = useServer()
  // We allow rendering even if server.url is missing initially to avoid blank screen
  // The app will prompt for server connection in the UI
  onMount(() => {
    console.log("[Layout] Mounted successfully")
  })

  return (
    <div class="relative flex-1 min-h-0 flex flex-col select-none [&_input]:select-text [&_textarea]:select-text [&_[contenteditable]]:select-text">
      {props.children}
    </div>
  )
}

/**
 * MainLayout – wraps the app routes with the sidebar Layout and app-specific providers.
 * The Landing Page at "/" does NOT use this wrapper.
 */
function MainLayout(props: ParentProps) {
  return (
    <PermissionProvider>
      <LayoutProvider>
        <NotificationProvider>
          <CommandProvider>
            <Layout>{props.children}</Layout>
          </CommandProvider>
        </NotificationProvider>
      </LayoutProvider>
    </PermissionProvider>
  )
}

export function App() {
  console.log("[App] Execution started")
  return (
    <MetaProvider>
      <Font />
      <ThemeProvider>
        <ErrorBoundary fallback={(error) => <ErrorPage error={error} />}>
          <AuthProvider>
            <DialogProvider>
              <MarkedProvider>
                <DiffComponentProvider component={Diff}>
                  <CodeComponentProvider component={Code}>
                    <ServerProvider defaultUrl={defaultServerUrl}>
                      <ServerKey>
                        <SkillProvider>
                          <GlobalSDKProvider>
                            <GlobalSyncProvider>
                              {(() => { console.log("[App] Reached Router"); return null })()}
                              <Router>
                                {/* Public routes - no authentication required */}
                                <Route path="/" component={LandingPage} />
                                <Route path="/login" component={LoginPage} />
                                <Route path="/login-callback" component={LoginCallbackPage} />

                              {/* App routes – wrapped in MainLayout (sidebar + providers) */}
                              <Route path="/home" component={(props) => (
                                <MainLayout>
                                  <Hero />
                                </MainLayout>
                              )} />
                              <Route path="/session/:id" component={(p) => (
                                <MainLayout>
                                  <Show when={p.params.id} keyed>
                                    <SDKProvider directory={p.params.id}>
                                      <TerminalProvider>
                                        <FileProvider>
                                          <PromptProvider>
                                            <Session />
                                          </PromptProvider>
                                        </FileProvider>
                                      </TerminalProvider>
                                    </SDKProvider>
                                  </Show>
                                </MainLayout>
                              )} />
                              <Route path="/:dir" component={(p) => (
                                <MainLayout>
                                  <DirectoryLayout>{p.children}</DirectoryLayout>
                                </MainLayout>
                              )}>
                                <Route path="/" component={() => <Navigate href="session" />} />
                                <Route
                                  path="/session/:id?"
                                  component={(p) => (
                                    <Show when={p.params.id ?? "new"} keyed>
                                      <SDKProvider directory={p.params.id ?? "new"}>
                                        <TerminalProvider>
                                          <FileProvider>
                                            <PromptProvider>
                                              <Session />
                                            </PromptProvider>
                                          </FileProvider>
                                        </TerminalProvider>
                                      </SDKProvider>
                                    </Show>
                                  )}
                                />
                              </Route>
                              <Route path="/schedule" component={() => (
                                <MainLayout>
                                  <SchedulePage />
                                </MainLayout>
                              )} />
                              <Route path="/skills" component={() => (
                                <MainLayout>
                                  <SkillsPage />
                                </MainLayout>
                              )} />
                              <Route path="/skills/:name" component={() => (
                                <MainLayout>
                                  <SkillDetailPage />
                                </MainLayout>
                              )} />
                            </Router>
                          </GlobalSyncProvider>
                        </GlobalSDKProvider>
                      </SkillProvider>
                    </ServerKey>
                  </ServerProvider>
                </CodeComponentProvider>
              </DiffComponentProvider>
            </MarkedProvider>
          </DialogProvider>
        </AuthProvider>
        </ErrorBoundary>
      </ThemeProvider>
    </MetaProvider>
  )
}