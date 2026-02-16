import { createMemo, splitProps, Show, type ComponentProps, type JSX, type ParentProps } from "solid-js"
import { TextField } from "./text-field"

// Form context and types
export interface FormFieldContextValue {
  name: string
}

export interface FormProps extends ParentProps<ComponentProps<"form">> {
  // Add form-specific props if needed
}

export function Form(props: FormProps) {
  const [local, others] = splitProps(props, ["children", "class"])
  return (
    <form data-component="form" class={local.class} {...others}>
      {local.children}
    </form>
  )
}

export interface FormFieldProps {
  name: string
  label?: string
  description?: string
  error?: string
  required?: boolean
  children: (props: { field: { name: string; id: string } }) => JSX.Element
}

export function FormField(props: FormFieldProps) {
  const fieldId = createMemo(() => `field-${props.name}`)

  return (
    <div data-component="form-field" data-field-name={props.name}>
      {props.children({ field: { name: props.name, id: fieldId() } })}
    </div>
  )
}

export interface FormItemProps extends ParentProps<ComponentProps<"div">> {}

export function FormItem(props: FormItemProps) {
  const [local, others] = splitProps(props, ["children", "class"])
  return (
    <div data-slot="form-item" class={local.class} {...others}>
      {local.children}
    </div>
  )
}

export interface FormLabelProps extends ComponentProps<"label"> {}

export function FormLabel(props: FormLabelProps) {
  const [local, others] = splitProps(props, ["children", "class"])
  return (
    <label data-slot="form-label" class={local.class} {...others}>
      {local.children}
    </label>
  )
}

export interface FormControlProps extends ParentProps<ComponentProps<"div">> {}

export function FormControl(props: FormControlProps) {
  const [local, others] = splitProps(props, ["children", "class"])
  return (
    <div data-slot="form-control" class={local.class} {...others}>
      {local.children}
    </div>
  )
}

export interface FormMessageProps extends ComponentProps<"div"> {
  error?: string
}

export function FormMessage(props: FormMessageProps) {
  const [local, others] = splitProps(props, ["error", "class", "children"])
  return (
    <Show when={local.error || local.children}>
      <div data-slot="form-message" class={local.class} {...others}>
        {local.error || local.children}
      </div>
    </Show>
  )
}
