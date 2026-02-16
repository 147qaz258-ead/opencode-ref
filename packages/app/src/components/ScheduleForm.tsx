import { createSignal, type JSX } from "solid-js"
import { Button } from "@opencode-ai/ui/button"
import { Dialog } from "@opencode-ai/ui/dialog"
import { Form, FormField, FormItem, FormLabel, FormControl, FormMessage } from "@opencode-ai/ui/form"
import { Input } from "@opencode-ai/ui/input"
import { Textarea } from "@opencode-ai/ui/textarea"
import { z } from "zod"
import { useNavigate } from "@solidjs/router"

const scheduleSchema = z.object({
  name: z.string().min(1, "任务名称不能为空"),
  cron: z.string().min(1, "Cron 表达式不能为空"),
  command: z.string().min(1, "命令不能为空")
})

type ScheduleFormData = z.infer<typeof scheduleSchema>
type ScheduleFormErrors = Partial<Record<keyof ScheduleFormData, string>>

type ScheduleFormProps = {
  onSubmit: (data: ScheduleFormData) => void
  disabled?: boolean
}

export default function ScheduleForm(props: ScheduleFormProps) {
  const [name, setName] = createSignal("")
  const [cron, setCron] = createSignal("")
  const [command, setCommand] = createSignal("")
  const [errors, setErrors] = createSignal<ScheduleFormErrors>({})

  const validate = (): boolean => {
    const result = scheduleSchema.safeParse({
      name: name(),
      cron: cron(),
      command: command()
    })

    if (!result.success) {
      const newErrors: ScheduleFormErrors = {}
      result.error.issues.forEach(err => {
        const key = err.path[0] as keyof ScheduleFormData
        if (key) {
          newErrors[key] = err.message
        }
      })
      setErrors(newErrors)
      return false
    }

    setErrors({})
    return true
  }

  const handleSubmit = (e: Event) => {
    e.preventDefault()

    if (props.disabled) return

    if (!validate()) return

    const data: ScheduleFormData = {
      name: name(),
      cron: cron(),
      command: command()
    }

    props.onSubmit(data)
  }

  return (
    <Form onSubmit={handleSubmit} class="space-y-4">
      <FormField name="name">
        {({ field }) => (
          <FormItem>
            <FormLabel for={field.id}>任务名称</FormLabel>
            <FormControl>
              <Input
                id={field.id}
                name={field.name}
                placeholder="输入任务名称"
                value={name()}
                onValueChange={setName}
                error={errors().name}
                class="w-full"
              />
            </FormControl>
            <FormMessage error={errors().name} />
          </FormItem>
        )}
      </FormField>

      <FormField name="cron">
        {({ field }) => (
          <FormItem>
            <FormLabel for={field.id}>Cron 表达式</FormLabel>
            <FormControl>
              <Input
                id={field.id}
                name={field.name}
                placeholder="例如: 0 2 * * * (每天凌晨2点)"
                value={cron()}
                onValueChange={setCron}
                error={errors().cron}
                class="w-full"
              />
            </FormControl>
            <FormMessage error={errors().cron} />
          </FormItem>
        )}
      </FormField>

      <FormField name="command">
        {({ field }) => (
          <FormItem>
            <FormLabel for={field.id}>执行命令</FormLabel>
            <FormControl>
              <Textarea
                id={field.id}
                name={field.name}
                placeholder="输入要执行的命令或脚本路径"
                value={command()}
                onValueChange={setCommand}
                error={errors().command}
                class="w-full h-24 resize-none"
              />
            </FormControl>
            <FormMessage error={errors().command} />
          </FormItem>
        )}
      </FormField>

      <div class="flex justify-end gap-2 pt-4">
        <Button
          type="button"
          variant="ghost"
          onClick={(e: Event) => {
            e.preventDefault()
            setName("")
            setCron("")
            setCommand("")
            setErrors({})
          }}
        >
          清空
        </Button>
        <Button type="submit" disabled={props.disabled}>
          创建任务
        </Button>
      </div>
    </Form>
  )
}
