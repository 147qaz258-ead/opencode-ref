# Implementation Plan: Agent Swarm

## Overview

This implementation plan builds the agent swarm functionality on top of OpenCode's existing infrastructure: Storage namespace for persistence, Bus system for events, Session parent-child relationships for agent hierarchy, and UserContainerManager for shared user containers. The plan adds three major features: Debate Mode for conflict resolution, Interns for ephemeral agents, and a Memory System for shared/private state.

**Key Architecture Point**: All Sessions (including all swarm agents) share the same user container managed by UserContainerManager. There is ONE container per USER, not per agent or per session.

## Tasks

- [ ] 1. Extend Agent.Info to support swarm mode
  - Modify `packages/opencode/src/agent/agent.ts`
  - Add "swarm" to the mode enum: `z.enum(["subagent", "primary", "all", "swarm"])`
  - Add swarmConfig optional field with maxInstances, communicationScope, autoScale, debateEnabled, internEnabled
  - Update Agent.list() to filter and return swarm agents
  - _Requirements: 1.1, 1.2, 1.3_

- [ ] 2. Extend Session.Info to support swarm metadata
  - Modify `packages/opencode/src/session/index.ts`
  - Add swarmMetadata optional field with swarmId, role (coordinator/worker/intern), parentSwarmId, debateSessionId
  - Update Session.createNext() to accept swarmMetadata parameter
  - _Requirements: 1.1, 1.4_

- [ ] 3. Create Storage path utilities for swarm data
  - [ ] 3.1 Create `packages/opencode/src/swarm/storage.ts`
    - Implement getSwarmPath(userId, swarmId) returning `["session", "user-{userId}", "swarm-{swarmId}"]`
    - Implement getSwarmMemoryPath(swarmId) returning `["swarm-memory", swarmId]`
    - Implement getDebatePath(swarmId, debateId) returning `["swarm-debate", swarmId, debateId]`
    - Implement getInternTaskPath(swarmId, internId) returning `["swarm-intern", swarmId, internId]`
    - _Requirements: 8.1, 8.2_

- [ ] 4. Define Bus events for swarm operations
  - [ ] 4.1 Add swarm lifecycle events to `packages/opencode/src/bus/index.ts`
    - Define SwarmCreated event with swarmId, userId, agentType, instanceCount
    - Define SwarmScaled event with swarmId, oldCount, newCount
    - Define SwarmMessage event with swarmId, fromInstanceId, toInstanceId, messageType, content, timestamp
    - _Requirements: 3.1, 3.3, 4.2_

  - [ ] 4.2 Add debate events to Bus namespace
    - Define DebateStarted event with swarmId, debateId, conflictingAgents, topic
    - Define DebateArgument event with debateId, agentId, argument, evidence
    - Define DebateResolved event with debateId, winningAgentId, decision, reasoning
    - _Requirements: 6.2, 6.3, 6.4, 6.5_

  - [ ] 4.3 Add intern events to Bus namespace
    - Define InternCreated event with swarmId, internId, task
    - Define InternCompleted event with internId, result, duration
    - _Requirements: 7.1, 7.3_

- [ ] 5. Implement Swarm Manager
  - [ ] 5.1 Create `packages/opencode/src/swarm/manager.ts`
    - Implement createSwarm(userId, config) that creates parent Session with swarmMetadata
    - Implement scaleSwarm(swarmId, targetCount) that creates/destroys worker Sessions
    - Implement getSwarmStatus(swarmId) that queries all child Sessions and returns aggregated status
    - Implement destroySwarm(swarmId) that removes parent and all child Sessions
    - _Requirements: 1.1, 1.2, 1.5, 4.2_

  - [ ]* 5.2 Write property test for swarm initialization
    - **Property 1: Swarm initialization creates valid agent pool**
    - **Validates: Requirements 1.2**

  - [ ]* 5.3 Write property test for swarm configuration
    - **Property 2: Swarm configuration parameters are applied correctly**
    - **Validates: Requirements 1.3**

  - [ ]* 5.4 Write property test for health monitoring
    - **Property 3: Agent health monitoring tracks all instances**
    - **Validates: Requirements 1.4**

  - [ ]* 5.5 Write property test for status queries
    - **Property 4: Swarm status queries return accurate information**
    - **Validates: Requirements 1.5**

- [ ] 6. Implement Debate Manager
  - [ ] 6.1 Create `packages/opencode/src/swarm/debate.ts`
    - Implement startDebate(swarmId, conflictingAgents, topic) that creates debate session in Storage
    - Implement submitArgument(debateId, agentId, argument, evidence) that stores argument and publishes Bus event
    - Implement resolveDebate(debateId, winningAgentId, decision, reasoning) that marks debate resolved and publishes event
    - Implement getDebate(debateId) that reads debate session from Storage
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5_

  - [ ]* 6.2 Write property test for conflict detection
    - **Property 21: Conflicting results are detected**
    - **Validates: Requirements 6.1**

  - [ ]* 6.3 Write property test for debate initiation
    - **Property 22: Conflicts trigger debate sessions**
    - **Validates: Requirements 6.2**

  - [ ]* 6.4 Write property test for argument collection
    - **Property 23: Debate arguments are collected**
    - **Validates: Requirements 6.3**

  - [ ]* 6.5 Write property test for debate resolution
    - **Property 24: Debate resolution produces decision**
    - **Validates: Requirements 6.4**

  - [ ]* 6.6 Write property test for debate event broadcasting
    - **Property 25: Debate events are broadcast via Bus**
    - **Validates: Requirements 6.5**

- [ ] 7. Implement Intern Manager
  - [ ] 7.1 Create `packages/opencode/src/swarm/intern.ts`
    - Implement createIntern(swarmId, task, userId) that creates child Session with role="intern"
    - Implement completeIntern(internId, result) that stores result, publishes event, and destroys Session
    - Implement getIntern(internId) that reads intern task from Storage
    - _Requirements: 7.1, 7.2, 7.3, 7.5_

  - [ ]* 7.2 Write property test for intern task assignment
    - **Property 26: Intern receives single atomic task**
    - **Validates: Requirements 7.2**

  - [ ]* 7.3 Write property test for intern cleanup
    - **Property 27: Intern Session is destroyed after completion**
    - **Validates: Requirements 7.3**

  - [ ]* 7.4 Write property test for intern context usage
    - **Property 28: Interns use less context than regular agents**
    - **Validates: Requirements 7.5**

- [ ] 8. Implement Memory Manager
  - [ ] 8.1 Create `packages/opencode/src/swarm/memory.ts`
    - Implement writeSwarmMemory(swarmId, key, value) using Storage.write()
    - Implement readSwarmMemory(swarmId, key) using Storage.read()
    - Implement getAgentMemoryPath(agentId) returning `/home/ubuntu/.agent-memory/{agentId}/`
    - Document that agents manage their own files in the shared container filesystem
    - No need for explicit initialization/cleanup - agents handle their own files
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5_

  - [ ]* 8.2 Write property test for agent memory access
    - **Property 29: Agent memory files are accessible on startup**
    - **Validates: Requirements 8.3**

  - [ ]* 8.3 Write property test for agent memory persistence
    - **Property 30: Agent memory files persist after termination**
    - **Validates: Requirements 8.4**

  - [ ]* 8.4 Write property test for swarm memory access
    - **Property 31: Agents can read swarm shared memory**
    - **Validates: Requirements 8.5**

- [ ] 9. Implement Communication Hub
  - [ ] 9.1 Create `packages/opencode/src/swarm/communication.ts`
    - Implement broadcastToSwarm(swarmId, message) that publishes SwarmMessage event to all workers
    - Implement sendToInstance(instanceId, message) that publishes SwarmMessage event with specific toInstanceId
    - Implement subscribeToSwarm(swarmId, callback) that uses Bus.subscribe() to listen for SwarmMessage events
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5_

  - [ ]* 9.2 Write property test for message delivery
    - **Property 10: Messages are delivered between agents**
    - **Validates: Requirements 3.1**

  - [ ]* 9.3 Write property test for message routing
    - **Property 11: Information requests are routed correctly**
    - **Validates: Requirements 3.2**

  - [ ]* 9.4 Write property test for message history
    - **Property 12: Message history is persisted**
    - **Validates: Requirements 3.3**

  - [ ]* 9.5 Write property test for message ordering
    - **Property 13: Message delivery preserves ordering**
    - **Validates: Requirements 3.4**

- [ ] 10. Implement Task Coordinator
  - [ ] 10.1 Create `packages/opencode/src/swarm/coordinator.ts`
    - Implement decomposeTask(task) that breaks complex task into subtasks
    - Implement assignSubtasks(subtasks, agents) that matches subtasks to agent capabilities
    - Implement trackProgress(swarmId) that monitors task execution and dependencies
    - Implement reassignFailedTask(taskId, newAgentId) that reassigns failed subtasks
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5_

  - [ ]* 10.2 Write property test for task decomposition
    - **Property 5: Task decomposition produces valid subtasks**
    - **Validates: Requirements 2.1**

  - [ ]* 10.3 Write property test for capability matching
    - **Property 6: Subtask assignment matches agent capabilities**
    - **Validates: Requirements 2.2**

  - [ ]* 10.4 Write property test for progress tracking
    - **Property 7: Task progress tracking reflects execution state**
    - **Validates: Requirements 2.3**

  - [ ]* 10.5 Write property test for task reassignment
    - **Property 8: Failed subtasks are reassigned**
    - **Validates: Requirements 2.4**

  - [ ]* 10.6 Write property test for dependency ordering
    - **Property 9: Task dependencies are respected**
    - **Validates: Requirements 2.5**

- [ ] 11. Implement Resource Monitor
  - [ ] 11.1 Create `packages/opencode/src/swarm/monitor.ts`
    - Implement collectMetrics(userId) that queries user container resource usage via UserContainerManager
    - Implement checkThresholds(swarmId) that compares metrics against configured limits
    - Implement triggerScaling(swarmId, action) that calls SwarmManager.scaleSwarm()
    - Implement trackSessionActivity(sessionId) that monitors Session-level activity
    - Note: Resource monitoring is at user-container level, not per-agent
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5_

  - [ ]* 11.2 Write property test for metric collection
    - **Property 14: Resource metrics are collected at user container level**
    - **Validates: Requirements 4.1**

  - [ ]* 11.3 Write property test for threshold scaling
    - **Property 15: Resource threshold triggers scaling**
    - **Validates: Requirements 4.2**

  - [ ]* 11.4 Write property test for session tracking
    - **Property 16: Session activity is tracked**
    - **Validates: Requirements 4.4**

  - [ ]* 11.5 Write property test for dynamic scaling
    - **Property 17: Dynamic scaling responds to workload**
    - **Validates: Requirements 4.5**

- [ ] 12. Implement Logging and Audit System
  - [ ] 12.1 Create `packages/opencode/src/swarm/logging.ts`
    - Implement aggregateLogs(swarmId) that collects logs from all agent Sessions
    - Implement generateReport(taskId) that creates execution report from task history
    - Implement createAuditEntry(operation, details) that writes to Storage audit trail
    - _Requirements: 5.1, 5.2, 5.5_

  - [ ]* 12.2 Write property test for log aggregation
    - **Property 18: Logs are aggregated from all instances**
    - **Validates: Requirements 5.1**

  - [ ]* 12.3 Write property test for report generation
    - **Property 19: Task completion generates reports**
    - **Validates: Requirements 5.2**

  - [ ]* 12.4 Write property test for audit trails
    - **Property 20: Audit trails record all operations**
    - **Validates: Requirements 5.5**

- [ ] 13. Create API endpoints for swarm management
  - [ ] 13.1 Add swarm routes to `packages/opencode/src/server/index.ts`
    - Add POST /swarm endpoint that calls SwarmManager.createSwarm()
    - Add GET /swarm endpoint that lists user's swarms
    - Add GET /swarm/:swarmId endpoint that calls SwarmManager.getSwarmStatus()
    - Add DELETE /swarm/:swarmId endpoint that calls SwarmManager.destroySwarm()
    - Add PATCH /swarm/:swarmId/scale endpoint that calls SwarmManager.scaleSwarm()
    - _Requirements: 1.1, 1.5, 4.2_

  - [ ] 13.2 Add debate routes
    - Add POST /swarm/:swarmId/debate endpoint that calls DebateManager.startDebate()
    - Add POST /swarm/:swarmId/debate/:debateId/argument endpoint that calls DebateManager.submitArgument()
    - Add POST /swarm/:swarmId/debate/:debateId/resolve endpoint that calls DebateManager.resolveDebate()
    - _Requirements: 6.2, 6.3, 6.4_

  - [ ] 13.3 Add intern routes
    - Add POST /swarm/:swarmId/intern endpoint that calls InternManager.createIntern()
    - Add POST /swarm/:swarmId/intern/:internId/complete endpoint that calls InternManager.completeIntern()
    - _Requirements: 7.1, 7.3_

  - [ ] 13.4 Add memory routes
    - Add GET /swarm/:swarmId/memory/:key endpoint that calls MemoryManager.readSwarmMemory()
    - Add PUT /swarm/:swarmId/memory/:key endpoint that calls MemoryManager.writeSwarmMemory()
    - _Requirements: 8.1, 8.5_

- [ ] 14. Create frontend components for swarm management
  - [ ] 14.1 Create `packages/app/src/components/swarm/SwarmManager.tsx`
    - Implement SwarmList component that displays user's swarms
    - Implement SwarmCreate component with form for swarm configuration
    - Implement SwarmStatus component that shows instance count, health, metrics
    - Implement SwarmScale component with controls for scaling up/down
    - _Requirements: 1.1, 1.3, 1.5, 4.3_

  - [ ] 14.2 Create `packages/app/src/components/swarm/DebateViewer.tsx`
    - Implement DebateList component that shows active debates
    - Implement DebateDetail component that displays arguments from each agent
    - Implement DebateResolution component that shows final decision
    - _Requirements: 6.2, 6.3, 6.4_

  - [ ] 14.3 Create `packages/app/src/components/swarm/CommunicationPanel.tsx`
    - Implement MessageList component that displays swarm messages
    - Implement MessageSend component with form for sending messages
    - Implement useSwarmEvents hook that subscribes to Bus events via SSE
    - _Requirements: 3.1, 3.3, 3.4_

  - [ ] 14.4 Extend Agent Selector to support swarm agents
    - Modify `packages/app/src/components/AgentSelector.tsx` to filter and display swarm agents
    - Add swarm configuration options to agent creation dialog
    - _Requirements: 1.1, 1.3_

- [ ] 15. Integration and testing
  - [ ] 15.1 Create integration test for full swarm lifecycle
    - Test creating swarm, scaling, executing tasks, and destroying swarm
    - Verify all Bus events are published correctly
    - Verify Storage paths contain expected data
    - Verify all Sessions share the same user container
    - _Requirements: 1.1, 1.2, 1.5, 4.2_

  - [ ] 15.2 Create integration test for debate workflow
    - Test detecting conflicts, starting debate, submitting arguments, resolving
    - Verify debate events are broadcast via Bus
    - Verify debate state is persisted to Storage
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5_

  - [ ] 15.3 Create integration test for intern workflow
    - Test creating intern, executing task, completing, and cleanup
    - Verify intern Session is destroyed (container remains running)
    - Verify intern uses less context than regular agent
    - _Requirements: 7.1, 7.2, 7.3, 7.5_

  - [ ] 15.4 Create integration test for memory system
    - Test writing/reading swarm shared memory
    - Test that agents can access files in shared container filesystem
    - Verify memory files persist after Session termination
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5_

- [ ] 16. Documentation
  - [ ] 16.1 Create user guide for swarm functionality
    - Document how to create and manage swarms
    - Document debate mode usage
    - Document intern agent usage
    - Document memory system usage
    - _Requirements: 1.1, 6.1, 7.1, 8.1_

  - [ ] 16.2 Create API documentation
    - Document all swarm API endpoints with examples
    - Document Bus event schemas
    - Document Storage path structure
    - _Requirements: 1.1, 3.1, 8.1_

## Notes

- Tasks marked with `*` are optional property-based tests and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Implementation builds on existing OpenCode infrastructure (Storage, Bus, Session, UserContainerManager)
- All swarm data uses user-scoped storage paths for multi-user isolation
- Bus events enable real-time updates to frontend via SSE
- Property tests should run minimum 100 iterations each
- **Critical**: All Sessions share the same user container - do NOT create per-agent containers
- Container lifecycle managed by UserContainerManager: created on first use, hibernated after 5 min idle
- Agent isolation is at Session level (separate context windows), not container level
