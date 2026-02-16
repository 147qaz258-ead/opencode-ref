import { TextField, type TextFieldProps } from "./text-field"
import type { ComponentProps } from "solid-js"

export interface InputProps extends Omit<TextFieldProps, "multiline"> {
  onValueChange?: (value: string) => void
}

export function Input(props: InputProps) {
  const handleChange = (value: string | Event) => {
    const strValue = typeof value === "string" ? value : (value as Event).target instanceof HTMLInputElement ? (value as Event).target.value : String(value)
    props.onValueChange?.(strValue)
  }

  return (
    <TextField
      {...props}
      onChange={handleChange}
    />
  )
}
