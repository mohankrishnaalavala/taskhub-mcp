/**
 * MCP tool types and interfaces for TaskHub
 */

import { z } from 'zod';

// MCP Tool result types
export interface ToolResult {
  content: Array<{
    type: 'text';
    text: string;
  }>;
  isError?: boolean;
}

// Task-related types
export type TaskStatus = 'todo' | 'claimed' | 'in_progress' | 'review' | 'done';

export interface TaskData {
  id: number;
  title: string;
  description: string;
  status: TaskStatus;
  assignee?: string;
  repo?: string;
  branch?: string;
  acceptanceCriteria: string[];
  createdAt: Date;
  updatedAt: Date;
}

// Artifact types
export interface ArtifactData {
  id: string;
  taskId: number;
  type: 'commit' | 'patch' | 'review' | 'pr';
  url?: string;
  sha256?: string;
  metadata?: Record<string, any>;
  createdAt: Date;
}

// Event types
export interface EventData {
  id: string;
  taskId?: number;
  actor: string;
  action: string;
  targetId?: string;
  payload: Record<string, any>;
  success: boolean;
  error?: string;
  createdAt: Date;
}

// MCP Tool response types
export interface SubmitSpecResponse {
  task_id: number;
  title: string;
  status: string;
  created_at: string;
}

export interface ListTasksResponse {
  tasks: Array<{
    id: number;
    title: string;
    description: string;
    status: string;
    assignee?: string;
    repo?: string;
    branch?: string;
    acceptance_criteria: string[];
    created_at: string;
    updated_at: string;
  }>;
  total: number;
  limit: number;
  offset: number;
}

export interface ClaimTaskResponse {
  task_id: number;
  title: string;
  description: string;
  status: TaskStatus;
  assignee: string; // Required since we're claiming the task
  repo: string | undefined;
  acceptance_criteria: string[];
  claimed_at: string;
}

export interface StartBranchResponse {
  task_id: number;
  branch_name: string;
  repo: string;
  base_branch: string;
  branch_sha: string;
  status: TaskStatus;
  dry_run: boolean;
}

export interface PushPatchResponse {
  task_id: number;
  branch_name: string;
  repo: string;
  commit_sha: string;
  files_changed: number;
  commit_message: string;
  dry_run: boolean;
}

// Open PR response
export interface OpenPrResponse {
  task_id: number;
  pr_number: number;
  repo: string;
  title: string;
  url: string;
  draft: boolean;
  branch_name: string;
  status: TaskStatus;
  dry_run: boolean;
  created_at: string;
}

// Post review response
export interface PostReviewResponse {
  review_id: string;
  task_id?: number | undefined;
  pr_number: number;
  repo: string;
  notes: string;
  block: boolean;
  status: 'posted' | 'blocked' | 'approved';
  dry_run: boolean;
  posted_at: string;
}

// Utility type for JSON serialization
export function serializeForDatabase(data: any): string {
  return JSON.stringify(data);
}

export function deserializeFromDatabase<T>(data: string): T {
  return JSON.parse(data) as T;
}
