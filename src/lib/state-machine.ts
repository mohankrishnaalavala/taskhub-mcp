/**
 * Task State Machine
 * 
 * Enforces strict state transitions as specified in Phase 4.5:
 * todo → claimed → in_progress → review → done
 */

import { ConflictError } from '../types/errors.js';

export type TaskStatus = 'todo' | 'claimed' | 'in_progress' | 'review' | 'done';

/**
 * Valid state transitions map
 */
const VALID_TRANSITIONS: Record<TaskStatus, TaskStatus[]> = {
  todo: ['claimed'],
  claimed: ['in_progress', 'todo'], // Allow unclaiming back to todo
  in_progress: ['review', 'claimed'], // Allow going back to claimed if needed
  review: ['done', 'in_progress'], // Allow going back to in_progress for fixes
  done: [], // Terminal state - no transitions allowed
};

/**
 * Action to required current state mapping
 */
const ACTION_REQUIREMENTS: Record<string, TaskStatus[]> = {
  claim_task: ['todo'],
  start_branch: ['claimed', 'in_progress'], // Allow restarting branch
  push_patch: ['in_progress'],
  open_pr: ['in_progress'],
  post_review: ['review'],
};

/**
 * Action to resulting state mapping
 */
const ACTION_RESULTS: Record<string, TaskStatus> = {
  claim_task: 'claimed',
  start_branch: 'in_progress',
  open_pr: 'review',
  // post_review can result in 'done' if approved, handled in the tool
};

/**
 * Validate if a state transition is allowed
 */
export function validateStateTransition(
  currentState: TaskStatus,
  newState: TaskStatus,
  action?: string
): { valid: boolean; error?: ConflictError } {
  // Check if the transition is valid
  const allowedTransitions = VALID_TRANSITIONS[currentState];
  
  if (!allowedTransitions.includes(newState)) {
    return {
      valid: false,
      error: new ConflictError(
        `Invalid state transition from '${currentState}' to '${newState}'`,
        'INVALID_STATE_TRANSITION',
        {
          currentState,
          newState,
          allowedTransitions,
          action,
        }
      ),
    };
  }

  return { valid: true };
}

/**
 * Validate if an action can be performed on a task in the current state
 */
export function validateActionForState(
  action: string,
  currentState: TaskStatus,
  taskId: number
): { valid: boolean; error?: ConflictError } {
  const requiredStates = ACTION_REQUIREMENTS[action];
  
  if (!requiredStates) {
    // Action not in our state machine - allow it
    return { valid: true };
  }

  if (!requiredStates.includes(currentState)) {
    return {
      valid: false,
      error: new ConflictError(
        `Action '${action}' cannot be performed on task ${taskId} in state '${currentState}'`,
        'ACTION_NOT_ALLOWED',
        {
          action,
          currentState,
          requiredStates,
          taskId,
        }
      ),
    };
  }

  return { valid: true };
}

/**
 * Get the resulting state for an action
 */
export function getActionResultState(action: string): TaskStatus | null {
  return ACTION_RESULTS[action] || null;
}

/**
 * Get all valid next states for a given state
 */
export function getValidNextStates(currentState: TaskStatus): TaskStatus[] {
  return VALID_TRANSITIONS[currentState] || [];
}

/**
 * Check if a state is terminal (no further transitions allowed)
 */
export function isTerminalState(state: TaskStatus): boolean {
  return VALID_TRANSITIONS[state].length === 0;
}

/**
 * Get human-readable description of state machine rules
 */
export function getStateMachineDescription(): string {
  return `
Task State Machine Rules:
- todo → claimed (via claim_task)
- claimed → in_progress (via start_branch)
- in_progress → review (via open_pr)
- review → done (via post_review with approval)

Allowed backwards transitions:
- claimed → todo (unclaim)
- in_progress → claimed (restart)
- review → in_progress (fixes needed)

Terminal state: done (no further transitions)
  `.trim();
}

/**
 * Validate state transition with detailed error message
 */
export function validateStateTransitionWithDetails(
  currentState: TaskStatus,
  newState: TaskStatus,
  action?: string,
  taskId?: number
): void {
  const validation = validateStateTransition(currentState, newState, action);
  
  if (!validation.valid && validation.error) {
    // Enhance error message with state machine description
    const enhancedError = new ConflictError(
      `${validation.error.message}\n\n${getStateMachineDescription()}`,
      validation.error.code,
      {
        ...validation.error.details,
        stateMachineRules: getStateMachineDescription(),
      }
    );
    
    throw enhancedError;
  }
}

/**
 * Validate action for state with detailed error message
 */
export function validateActionForStateWithDetails(
  action: string,
  currentState: TaskStatus,
  taskId: number
): void {
  const validation = validateActionForState(action, currentState, taskId);
  
  if (!validation.valid && validation.error) {
    // Enhance error message with state machine description
    const enhancedError = new ConflictError(
      `${validation.error.message}\n\n${getStateMachineDescription()}`,
      validation.error.code,
      {
        ...validation.error.details,
        stateMachineRules: getStateMachineDescription(),
      }
    );
    
    throw enhancedError;
  }
}
