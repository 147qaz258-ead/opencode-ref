# Scheduler API

## 概述

Scheduler API 提供了任务调度功能，允许用户创建、管理和查询定时任务。

## 端点

### GET /api/schedule

列出所有已创建的定时任务。

**响应:**
```json
[
  {
    "id": "task-id",
    "name": "任务名称",
    "command": "要执行的命令",
    "schedule": "*/5 * * * *",
    "cron": null,
    "enabled": true,
    "createdAt": "2024-01-01T00:00:00.000Z",
    "updatedAt": "2024-01-01T00:00:00.000Z"
  }
]
```

### POST /api/schedule

创建新的定时任务。

**请求体:**
```json
{
  "name": "任务名称",
  "command": "要执行的命令",
  "schedule": "*/5 * * * *",
  "cron": null,
  "enabled": true
}
```

**响应 (201 Created):**
```json
{
  "id": "task-id",
  "name": "任务名称",
  "command": "要执行的命令",
  "schedule": "*/5 * * * *",
  "cron": null,
  "enabled": true,
  "createdAt": "2024-01-01T00:00:00.000Z",
  "updatedAt": "2024-01-01T00:00:00.000Z"
}
```

### DELETE /api/schedule/:id

删除指定的定时任务。

**响应 (204 No Content):**

### GET /api/schedule/:id/result

获取指定任务的执行结果。

**响应:**
```json
{
  "taskId": "task-id",
  "status": "completed",
  "exitCode": 0,
  "output": "任务输出",
  "error": null,
  "startTime": "2024-01-01T00:00:00.000Z",
  "endTime": "2024-01-01T00:00:01.000Z",
  "duration": 1000
}
```

## 状态码

- `200 OK` - 请求成功
- `201 Created` - 任务创建成功
- `204 No Content` - 任务删除成功
- `400 Bad Request` - 请求参数无效
- `404 Not Found` - 资源不存在

## 错误处理

API 使用标准的 HTTP 状态码表示错误。当发生错误时，响应体将包含错误信息。