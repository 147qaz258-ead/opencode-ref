import { Dialog as Kobalte } from "@kobalte/core/dialog"
import { ComponentProps, JSXElement, Match, ParentProps, Show, Switch, splitProps } from "solid-js"
import { IconButton } from "./icon-button"

/**
 * DialogContent - 用于受控 Dialog 内的内容容器
 */
export interface DialogContentProps extends ParentProps {
  class?: ComponentProps<"div">["class"]
  classList?: ComponentProps<"div">["classList"]
}

function DialogContent(props: DialogContentProps) {
  return (
    <Kobalte.Content
      data-slot="dialog-content"
      classList={{
        ...(props.classList ?? {}),
        [props.class ?? ""]: !!props.class,
      }}
      onOpenAutoFocus={(e) => {
        const target = e.currentTarget as HTMLElement | null
        const autofocusEl = target?.querySelector("[autofocus]") as HTMLElement | null
        if (autofocusEl) {
          e.preventDefault()
          autofocusEl.focus()
        }
      }}
    >
      {props.children}
    </Kobalte.Content>
  )
}

export interface DialogProps extends ParentProps {
  title?: JSXElement
  description?: JSXElement
  action?: JSXElement
  class?: ComponentProps<"div">["class"]
  classList?: ComponentProps<"div">["classList"]
  /** 受控模式: 对话框是否打开 */
  open?: boolean
  /** 受控模式: 打开状态变化回调 */
  onOpenChange?: (open: boolean) => void
  /** 对话框尺寸 */
  size?: "normal" | "large"
}

/**
 * Dialog 组件
 *
 * 支持两种使用方式:
 * 1. 非受控模式 (与 useDialog context 配合):
 *    dialog.show(() => <Dialog title="...">...</Dialog>)
 *
 * 2. 受控模式 (直接渲染):
 *    <Dialog open={open()} onOpenChange={setOpen}>
 *      <Dialog.Content>...</Dialog.Content>
 *    </Dialog>
 */
export function Dialog(props: DialogProps) {
  const [local, rest] = splitProps(props, ["open", "onOpenChange", "title", "description", "action", "class", "classList", "size", "children"])

  // 受控模式：有 open prop
  if (local.open !== undefined) {
    return (
      <Kobalte
        modal
        open={local.open}
        onOpenChange={local.onOpenChange}
      >
        <Kobalte.Portal>
          <Kobalte.Overlay data-component="dialog-overlay" />
          <div data-component="dialog" data-size={local.size}>
            <div data-slot="dialog-container">
              <Kobalte.Content
                data-slot="dialog-content"
                classList={{
                  ...(local.classList ?? {}),
                  [local.class ?? ""]: !!local.class,
                }}
                onOpenAutoFocus={(e) => {
                  const target = e.currentTarget as HTMLElement | null
                  const autofocusEl = target?.querySelector("[autofocus]") as HTMLElement | null
                  if (autofocusEl) {
                    e.preventDefault()
                    autofocusEl.focus()
                  }
                }}
              >
                <Show when={local.title || local.action}>
                  <div data-slot="dialog-header">
                    <Show when={local.title}>
                      <Kobalte.Title data-slot="dialog-title">{local.title}</Kobalte.Title>
                    </Show>
                    <Switch>
                      <Match when={local.action}>{local.action}</Match>
                      <Match when={true}>
                        <Kobalte.CloseButton data-slot="dialog-close-button" as={IconButton} icon="close" variant="ghost" />
                      </Match>
                    </Switch>
                  </div>
                </Show>
                <Show when={local.description}>
                  <Kobalte.Description data-slot="dialog-description">{local.description}</Kobalte.Description>
                </Show>
                <div data-slot="dialog-body">{local.children}</div>
              </Kobalte.Content>
            </div>
          </div>
        </Kobalte.Portal>
      </Kobalte>
    )
  }

  // 非受控模式：与 useDialog context 配合使用
  return (
    <div data-component="dialog" data-size={local.size}>
      <div data-slot="dialog-container">
        <Kobalte.Content
          data-slot="dialog-content"
          classList={{
            ...(local.classList ?? {}),
            [local.class ?? ""]: !!local.class,
          }}
          onOpenAutoFocus={(e) => {
            const target = e.currentTarget as HTMLElement | null
            const autofocusEl = target?.querySelector("[autofocus]") as HTMLElement | null
            if (autofocusEl) {
              e.preventDefault()
              autofocusEl.focus()
            }
          }}
        >
          <Show when={local.title || local.action}>
            <div data-slot="dialog-header">
              <Show when={local.title}>
                <Kobalte.Title data-slot="dialog-title">{local.title}</Kobalte.Title>
              </Show>
              <Switch>
                <Match when={local.action}>{local.action}</Match>
                <Match when={true}>
                  <Kobalte.CloseButton data-slot="dialog-close-button" as={IconButton} icon="close" variant="ghost" />
                </Match>
              </Switch>
            </div>
          </Show>
          <Show when={local.description}>
            <Kobalte.Description data-slot="dialog-description">{local.description}</Kobalte.Description>
          </Show>
          <div data-slot="dialog-body">{local.children}</div>
        </Kobalte.Content>
      </div>
    </div>
  )
}

// 导出子组件
Dialog.Content = DialogContent
