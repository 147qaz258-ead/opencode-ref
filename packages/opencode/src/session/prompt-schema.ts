/**
 * Prompt Schema - Fixed Version
 *
 * TDD Phase 3: GREEN - Fixed Zod schema for prompt input validation
 *
 * Problem: The original schema used z.discriminatedUnion which could fail
 * when parts don't perfectly match the discriminator field expectations.
 *
 * Solution: Use z.union with .passthrough() to allow more flexibility
 * while maintaining type safety.
 */

import z from "zod"
import { MessageV2 } from "./message-v2"

/**
 * Text part input - for user text messages
 */
export const TextPartInput = z
  .object({
    id: z.string().optional(),
    type: z.literal("text"),
    text: z.string(),
  })
  .passthrough()

/**
 * File part input - for file uploads
 */
export const FilePartInput = z
  .object({
    id: z.string().optional(),
    type: z.literal("file"),
    url: z.string(),
    mime: z.string(),
    filename: z.string().optional(),
  })
  .passthrough()

/**
 * Agent part input - for agent mentions
 */
export const AgentPartInput = z
  .object({
    id: z.string().optional(),
    type: z.literal("agent"),
    name: z.string(),
  })
  .passthrough()

/**
 * Subtask part input - for subtask references
 */
export const SubtaskPartInput = z
  .object({
    id: z.string().optional(),
    type: z.literal("subtask"),
  })
  .passthrough()

/**
 * Skill part input - for skill invocations
 */
export const SkillPartInput = z
  .object({
    id: z.string().optional(),
    type: z.literal("skill"),
  })
  .passthrough()

/**
 * Tool part input - for tool calls
 */
export const ToolPartInput = z
  .object({
    id: z.string().optional(),
    type: z.literal("tool"),
  })
  .passthrough()

/**
 * Reasoning part input - for AI reasoning
 */
export const ReasoningPartInput = z
  .object({
    id: z.string().optional(),
    type: z.literal("reasoning"),
  })
  .passthrough()

/**
 * Patch part input - for code patches
 */
export const PatchPartInput = z
  .object({
    id: z.string().optional(),
    type: z.literal("patch"),
  })
  .passthrough()

/**
 * Snapshot part input - for state snapshots
 */
export const SnapshotPartInput = z
  .object({
    id: z.string().optional(),
    type: z.literal("snapshot"),
  })
  .passthrough()

/**
 * Retry part input - for retry attempts
 */
export const RetryPartInput = z
  .object({
    id: z.string().optional(),
    type: z.literal("retry"),
  })
  .passthrough()

/**
 * Compaction part input - for session compaction
 */
export const CompactionPartInput = z
  .object({
    id: z.string().optional(),
    type: z.literal("compaction"),
  })
  .passthrough()

/**
 * Union of all part types for input validation
 * Using z.union instead of z.discriminatedUnion for better compatibility
 */
export const PartInput = z.union([
  TextPartInput,
  FilePartInput,
  AgentPartInput,
  SubtaskPartInput,
  SkillPartInput,
  ToolPartInput,
  ReasoningPartInput,
  PatchPartInput,
  SnapshotPartInput,
  RetryPartInput,
  CompactionPartInput,
])

/**
 * Prompt input schema - for sending messages to AI
 *
 * Key features:
 * 1. Uses z.union instead of z.discriminatedUnion (fixes 400 error)
 * 2. All part schemas use .passthrough() for forward compatibility
 * 3. Main schema uses .passthrough() to allow extra fields
 * 4. Field names match the original schema exactly (backward compatible)
 */
export const PromptInput = z
  .object({
    sessionID: z.string(),
    messageID: z.string().optional(),
    model: z
      .object({
        providerID: z.string(),
        modelID: z.string(),
      })
      .passthrough()
      .optional(),
    agent: z.string().optional(),
    noReply: z.boolean().optional(),
    tools: z.record(z.string(), z.boolean()).optional(),
    system: z.string().optional(),
    variant: z.string().optional(),
    parts: z.array(PartInput).min(1, "At least one part is required"),
  })
  .passthrough()

/**
 * Type exports for TypeScript
 */
export type TextPartInput = z.infer<typeof TextPartInput>
export type FilePartInput = z.infer<typeof FilePartInput>
export type AgentPartInput = z.infer<typeof AgentPartInput>
export type PartInput = z.infer<typeof PartInput>
export type PromptInput = z.infer<typeof PromptInput>
