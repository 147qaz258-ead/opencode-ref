import { TextField, type TextFieldProps } from "./text-field"

export interface TextareaProps extends Omit<TextFieldProps, "copyable"> {
  autoResize?: boolean
  onValueChange?: (value: string) => void
}

export function Textarea(props: TextareaProps) {
  const handleChange = (value: string | Event) => {
    const strValue = typeof value === "string" ? value : (value as Event).target instanceof HTMLTextAreaElement ? (value as Event).target.value : String(value)
    props.onValueChange?.(strValue)
  }

  return (
    <TextField
      {...props}
      multiline={true}
      autoResize={props.autoResize}
      onChange={handleChange}
    />
  )
}
