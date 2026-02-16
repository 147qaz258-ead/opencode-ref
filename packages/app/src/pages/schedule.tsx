import { createSignal, For, Show, type ParentProps, onMount } from "solid-js"
import { A, useNavigate } from "@solidjs/router"
import { Button } from "@opencode-ai/ui/button"
import { Icon } from "@opencode-ai/ui/icon"
import { Card } from "@opencode-ai/ui/card"
import { Table } from "@opencode-ai/ui/table"
import { Dialog } from "@opencode-ai/ui/dialog"
import { useLayout } from "@/context/layout"
import { useGlobalSDK } from "@/context/global-sdk"
import { DateTime } from "luxon"
import ScheduleForm from "@/components/ScheduleForm"
import { showToast, toaster } from "@opencode-ai/ui/toast"

// 后端API返回的任务结构
interface ApiTask {
  id: string
  projectId: string
  schedule: {
    cron: string
    nextRun: string // ISO datetime
  }
  prompt: string
  metadata: {
    title?: string
    [key: string]: any
  }
  createdAt: string // ISO datetime
  updatedAt: string // ISO datetime
}

// 前端显示的任务结构
interface ScheduleTask {
  id: string
  name: string
  cron: string
  command: string
  lastRun?: DateTime
  nextRun?: DateTime
  status: "active" | "inactive" | "error"
  lastResult?: string
}

// API基础URL
const API_BASE = "/api/schedule"

// 从 API 任务转换为前端任务
function apiTaskToScheduleTask(apiTask: ApiTask): ScheduleTask {
  return {
    id: apiTask.id,
    name: apiTask.metadata?.title || apiTask.prompt.slice(0, 50),
    cron: apiTask.schedule.cron,
    command: apiTask.prompt,
    nextRun: DateTime.fromISO(apiTask.schedule.nextRun),
    lastRun: DateTime.fromISO(apiTask.updatedAt), // 使用更新时间作为上次运行时间
    status: "active",
    lastResult: "待运行"
  }
}

export default function SchedulePage(props: ParentProps) {
  const layout = useLayout()
  const globalSDK = useGlobalSDK()
  const navigate = useNavigate()
  const [tasks, setTasks] = createSignal<ScheduleTask[]>([])
  const [showCreateDialog, setShowCreateDialog] = createSignal(false)
  const [selectedTask, setSelectedTask] = createSignal<ScheduleTask | null>(null)
  const [isLoading, setIsLoading] = createSignal(false)
  const [error, setError] = createSignal<string | null>(null)

  // 从API加载任务
  const fetchTasks = async () => {
    setIsLoading(true)
    setError(null)
    try {
      const res = await fetch(API_BASE)
      if (!res.ok) {
        throw new Error(`Failed to fetch tasks: ${res.status}`)
      }
      const apiTasks: ApiTask[] = await res.json()
      const scheduleTasks = apiTasks.map(apiTaskToScheduleTask)
      setTasks(scheduleTasks)
    } catch (err) {
      console.error("Failed to fetch tasks:", err)
      setError(err instanceof Error ? err.message : "Failed to load tasks")
      showToast({
        title: "加载失败",
        description: "无法加载定时任务列表",
        variant: "error"
      })
    } finally {
      setIsLoading(false)
    }
  }

  // 初始化任务数据
  onMount(() => {
    fetchTasks()
  })

  // 格式化时间
  const formatDateTime = (dt: DateTime) => {
    return dt.toFormat("yyyy-MM-dd HH:mm")
  }

  // 创建新任务
  const handleCreateTask = async (taskData: any) => {
    setIsLoading(true)
    setError(null)
    try {
      const apiPayload = {
        schedule: taskData.cron,
        prompt: taskData.command,
        metadata: {
          title: taskData.name,
        }
      }

      const res = await fetch(API_BASE, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(apiPayload),
      })

      if (!res.ok) {
        throw new Error(`Failed to create task: ${res.status}`)
      }

      const createdTask: ApiTask = await res.json()

      // 刷新任务列表
      await fetchTasks()

      setShowCreateDialog(false)
      showToast({
        title: "任务创建成功",
        description: `定时任务 "${taskData.name}" 已创建`
      })
    } catch (err) {
      console.error("Failed to create task:", err)
      setError(err instanceof Error ? err.message : "Failed to create task")
      showToast({
        title: "创建失败",
        description: "无法创建定时任务",
        variant: "error"
      })
    } finally {
      setIsLoading(false)
    }
  }

  // 删除任务
  const handleDeleteTask = async (taskId: string) => {
    setIsLoading(true)
    setError(null)
    try {
      const res = await fetch(`${API_BASE}/${taskId}`, {
        method: "DELETE",
      })

      if (!res.ok) {
        throw new Error(`Failed to delete task: ${res.status}`)
      }

      // 从本地状态中移除
      setTasks(tasks().filter(t => t.id !== taskId))

      showToast({
        title: "任务删除成功",
        description: "定时任务已删除"
      })
    } catch (err) {
      console.error("Failed to delete task:", err)
      setError(err instanceof Error ? err.message : "Failed to delete task")
      showToast({
        title: "删除失败",
        description: "无法删除定时任务",
        variant: "error"
      })
    } finally {
      setIsLoading(false)
    }
  }

  // 查看任务结果
  const handleViewResult = async (task: ScheduleTask) => {
    setIsLoading(true)
    try {
      const res = await fetch(`${API_BASE}/${task.id}/result`)
      if (res.ok) {
        const result = await res.json()
        setSelectedTask({
          ...task,
          lastResult: result.output || result.error || "暂无结果"
        })
      } else {
        setSelectedTask({
          ...task,
          lastResult: "暂无执行结果"
        })
      }
    } catch (err) {
      console.error("Failed to fetch result:", err)
      setSelectedTask({
        ...task,
        lastResult: "无法获取执行结果"
      })
    } finally {
      setIsLoading(false)
    }
  }

  // 刷新按钮
  const handleRefresh = () => {
    fetchTasks()
  }

  return (
    <div class="flex-1 min-h-0 flex flex-col">
      <div class="flex items-center justify-between mb-6">
        <h1 class="text-18-semibold text-text-strong">定时任务</h1>
        <div class="flex items-center gap-2">
          <Button
            variant="ghost"
            icon="refresh"
            onClick={handleRefresh}
            disabled={isLoading()}
          >
            刷新
          </Button>
          <Button
            variant="primary"
            icon="plus"
            onClick={() => setShowCreateDialog(true)}
            disabled={isLoading()}
          >
            创建任务
          </Button>
        </div>
      </div>

      {/* 错误提示 */}
      <Show when={error()}>
        <div class="mb-4 p-3 bg-surface-critical-base text-text-critical-strong rounded-lg text-14-medium">
          {error()}
        </div>
      </Show>

      <Card class="flex-1 min-h-0 overflow-hidden">
        <Show when={isLoading()}>
          <div class="flex items-center justify-center h-full">
            <div class="text-14-medium text-text-subtle">加载中...</div>
          </div>
        </Show>
        <Show when={!isLoading()}>
          <Table.Root class="w-full h-full">
            <Table.Header>
              <Table.Row>
                <Table.HeaderCell>任务名称</Table.HeaderCell>
                <Table.HeaderCell>Cron 表达式</Table.HeaderCell>
                <Table.HeaderCell>命令</Table.HeaderCell>
                <Table.HeaderCell>下次运行</Table.HeaderCell>
                <Table.HeaderCell>状态</Table.HeaderCell>
                <Table.HeaderCell>操作</Table.HeaderCell>
              </Table.Row>
            </Table.Header>
            <Table.Body>
              <For each={tasks()}>
                {(task) => (
                  <Table.Row>
                    <Table.Cell class="text-14-medium text-text-strong">{task.name}</Table.Cell>
                    <Table.Cell class="text-14-medium text-text-subtle">{task.cron}</Table.Cell>
                    <Table.Cell class="text-14-medium text-text-subtle">{task.command.slice(0, 50)}</Table.Cell>
                    <Table.Cell class="text-14-medium text-text-subtle">
                      <Show when={task.nextRun}>
                        {formatDateTime(task.nextRun!)}
                      </Show>
                      <Show when={!task.nextRun}>-</Show>
                    </Table.Cell>
                    <Table.Cell>
                      <span
                        classList={{
                          "text-12-medium px-2 py-0.5 rounded-full": true,
                          "bg-surface-success-base text-text-success-strong": task.status === "active",
                          "bg-surface-warning-base text-text-warning-strong": task.status === "inactive",
                          "bg-surface-critical-base text-text-critical-strong": task.status === "error",
                        }}
                      >
                        {task.status === "active" ? "活跃" : task.status === "inactive" ? "非活跃" : "错误"}
                      </span>
                    </Table.Cell>
                    <Table.Cell>
                      <div class="flex items-center gap-2">
                        <Button
                          variant="ghost"
                          size="small"
                          onClick={() => handleViewResult(task)}
                          disabled={isLoading()}
                        >
                          查看结果
                        </Button>
                        <Button
                          variant="ghost"
                          size="small"
                          onClick={() => handleDeleteTask(task.id)}
                          disabled={isLoading()}
                        >
                          删除
                        </Button>
                      </div>
                    </Table.Cell>
                  </Table.Row>
                )}
              </For>
              <Show when={tasks().length === 0}>
                <Table.Row>
                  <Table.Cell colspan="7" class="text-center py-8">
                    <div class="text-14-medium text-text-subtle">暂无定时任务</div>
                  </Table.Cell>
                </Table.Row>
              </Show>
            </Table.Body>
          </Table.Root>
        </Show>
      </Card>

      {/* 创建任务对话框 */}
      <Dialog open={showCreateDialog()} onOpenChange={setShowCreateDialog}>
        <Dialog.Content class="w-[500px] max-w-full">
          <Dialog.Header>
            <Dialog.Title>创建定时任务</Dialog.Title>
            <Dialog.Description>
              配置新的定时任务，设置 Cron 表达式和要执行的提示词
            </Dialog.Description>
          </Dialog.Header>
          <ScheduleForm onSubmit={handleCreateTask} disabled={isLoading()} />
        </Dialog.Content>
      </Dialog>

      {/* 查看结果对话框 */}
      <Show when={selectedTask()}>
        <Dialog open={!!selectedTask()} onOpenChange={() => setSelectedTask(null)}>
          <Dialog.Content class="w-[600px] max-w-full">
            <Dialog.Header>
              <Dialog.Title>{selectedTask()?.name} - 执行结果</Dialog.Title>
              <Dialog.Description>
                定时任务的最近执行结果
              </Dialog.Description>
            </Dialog.Header>
            <div class="p-4 bg-background-raised-base rounded-lg">
              <p class="text-14-medium text-text-strong mb-2">状态: {selectedTask()?.lastResult || "待运行"}</p>
              <Show when={selectedTask()?.nextRun}>
                <p class="text-14-medium text-text-subtle">下次运行: {formatDateTime(selectedTask()!.nextRun!)}</p>
              </Show>
            </div>
          </Dialog.Content>
        </Dialog>
      </Show>
    </div>
  )
}
