/**
 * Unit tests for state machine validation
 */

import { describe, it, expect } from 'vitest';
import {
  validateStateTransition,
  validateActionForState,
  getActionResultState,
  getValidNextStates,
  isTerminalState,
  TaskStatus,
} from '../../src/lib/state-machine.js';

describe('State Machine', () => {
  describe('validateStateTransition', () => {
    it('should allow valid transitions', () => {
      const result = validateStateTransition('todo', 'claimed');
      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('should reject invalid transitions', () => {
      const result = validateStateTransition('todo', 'done');
      expect(result.valid).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.error?.code).toBe('INVALID_STATE_TRANSITION');
    });

    it('should allow backwards transitions', () => {
      const result = validateStateTransition('claimed', 'todo');
      expect(result.valid).toBe(true);
    });

    it('should reject transitions from terminal state', () => {
      const result = validateStateTransition('done', 'todo');
      expect(result.valid).toBe(false);
    });
  });

  describe('validateActionForState', () => {
    it('should allow claim_task on todo status', () => {
      const result = validateActionForState('claim_task', 'todo', 1);
      expect(result.valid).toBe(true);
    });

    it('should reject claim_task on non-todo status', () => {
      const result = validateActionForState('claim_task', 'claimed', 1);
      expect(result.valid).toBe(false);
      expect(result.error?.code).toBe('ACTION_NOT_ALLOWED');
    });

    it('should allow start_branch on claimed or in_progress', () => {
      expect(validateActionForState('start_branch', 'claimed', 1).valid).toBe(true);
      expect(validateActionForState('start_branch', 'in_progress', 1).valid).toBe(true);
    });

    it('should allow unknown actions', () => {
      const result = validateActionForState('unknown_action', 'todo', 1);
      expect(result.valid).toBe(true);
    });
  });

  describe('getActionResultState', () => {
    it('should return correct result states', () => {
      expect(getActionResultState('claim_task')).toBe('claimed');
      expect(getActionResultState('start_branch')).toBe('in_progress');
      expect(getActionResultState('open_pr')).toBe('review');
    });

    it('should return null for unknown actions', () => {
      expect(getActionResultState('unknown_action')).toBeNull();
    });
  });

  describe('getValidNextStates', () => {
    it('should return correct next states', () => {
      expect(getValidNextStates('todo')).toEqual(['claimed']);
      expect(getValidNextStates('claimed')).toEqual(['in_progress', 'todo']);
      expect(getValidNextStates('done')).toEqual([]);
    });
  });

  describe('isTerminalState', () => {
    it('should identify terminal states', () => {
      expect(isTerminalState('done')).toBe(true);
      expect(isTerminalState('todo')).toBe(false);
      expect(isTerminalState('claimed')).toBe(false);
    });
  });

  describe('State Machine Flow', () => {
    it('should support complete workflow', () => {
      const states: TaskStatus[] = ['todo', 'claimed', 'in_progress', 'review', 'done'];
      
      for (let i = 0; i < states.length - 1; i++) {
        const current = states[i];
        const next = states[i + 1];
        const result = validateStateTransition(current, next);
        expect(result.valid).toBe(true);
      }
    });

    it('should support backwards transitions for fixes', () => {
      expect(validateStateTransition('review', 'in_progress').valid).toBe(true);
      expect(validateStateTransition('in_progress', 'claimed').valid).toBe(true);
    });
  });
});
