/**
 * Sandbox execution result interfaces
 *
 * Type definitions for the sandbox API that provides shell and file operations
 * within a containerized environment.
 */

import { NamedError } from "@opencode-ai/util/error"
import { z } from "zod"

/**
 * Options for shell command execution
 */
export interface ShellExecOptions {
  command: string
  execDir?: string
  timeout?: number
  id?: string
}

/**
 * Result from shell command execution
 */
export interface ShellExecResult {
  id: string
  exitCode: number
  stdout: string
  stderr: string
  complete: boolean
}

/**
 * Extended shell result with timestamps
 */
export interface ShellViewResult extends ShellExecResult {
  createdAt: number
  updatedAt: number
}

/**
 * Options for file read operations
 */
export interface FileReadOptions {
  startLine?: number
  endLine?: number
  sudo?: boolean
}

/**
 * Result from file read operations
 */
export interface FileReadResult {
  content: string
  encoding: string
}

/**
 * Options for file write operations
 */
export interface FileWriteOptions {
  append?: boolean
  sudo?: boolean
}

/**
 * Result from file write operations
 */
export interface FileWriteResult {
  path: string
  size: number
  written: boolean
}

/**
 * Result from file stat operations
 */
export interface FileStatResult {
  path: string
  size: number
  mode: number
  mtime: number
  type: "file" | "directory"
}

/**
 * Result from file find operations
 */
export interface FileFindResult {
  files: string[]
  count: number
}

/**
 * Entry in file list result
 */
export interface FileListEntry {
  name: string
  type: "file" | "directory"
  size: number
}

/**
 * Result from file list operations
 */
export interface FileListResult {
  entries: FileListEntry[]
}

/**
 * Options for sandbox error creation
 */
export interface SandboxErrorOptions {
  message: string
  code?: string
  statusCode?: number
  isRetryable?: boolean
}

/**
 * Sandbox error type
 * Used for errors that occur during sandbox operations
 */
export const SandboxError = NamedError.create("SandboxError", z.object({
  message: z.string(),
  code: z.string().optional(),
  statusCode: z.number().optional(),
  isRetryable: z.boolean().optional(),
}))
