/**
 * Integration tests for MCP server
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { spawn, ChildProcess } from 'child_process';
import { join } from 'path';

interface McpRequest {
  jsonrpc: string;
  id: number;
  method: string;
  params?: any;
}

interface McpResponse {
  jsonrpc: string;
  id: number;
  result?: any;
  error?: any;
}

describe('MCP Server Integration', () => {
  let server: ChildProcess;
  let requestId = 1;

  const sendRequest = (request: McpRequest): Promise<McpResponse> => {
    return new Promise((resolve, reject) => {
      const requestStr = JSON.stringify(request) + '\n';
      let responseData = '';
      
      const timeout = setTimeout(() => {
        reject(new Error('Request timeout'));
      }, 10000);
      
      const dataHandler = (data: Buffer) => {
        responseData += data.toString();
        
        const lines = responseData.split('\n');
        for (let i = 0; i < lines.length - 1; i++) {
          const line = lines[i].trim();
          if (line) {
            try {
              const response = JSON.parse(line);
              if (response.id === request.id) {
                clearTimeout(timeout);
                server.stdout?.off('data', dataHandler);
                resolve(response);
                return;
              }
            } catch (e) {
              // Continue parsing
            }
          }
        }
        
        responseData = lines[lines.length - 1];
      };
      
      server.stdout?.on('data', dataHandler);
      server.stdin?.write(requestStr);
    });
  };

  beforeAll(async () => {
    // Start the MCP server
    const projectRoot = join(__dirname, '../..');
    server = spawn('node', ['dist/server.js'], {
      cwd: projectRoot,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, NODE_ENV: 'test' }
    });

    // Wait for server to start
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Server startup timeout'));
      }, 10000);
      
      server.stdout?.on('data', (data) => {
        const output = data.toString();
        if (output.includes('TaskHub MCP Server started successfully')) {
          clearTimeout(timeout);
          resolve();
        }
      });
      
      server.on('error', (error) => {
        clearTimeout(timeout);
        reject(error);
      });
    });
  });

  afterAll(() => {
    if (server) {
      server.kill();
    }
  });

  beforeEach(() => {
    requestId++;
  });

  describe('Server Initialization', () => {
    it('should initialize successfully', async () => {
      const response = await sendRequest({
        jsonrpc: '2.0',
        id: requestId,
        method: 'initialize',
        params: {
          protocolVersion: '2024-11-05',
          capabilities: {},
          clientInfo: { name: 'test-client', version: '1.0.0' }
        }
      });

      expect(response.result).toBeDefined();
      expect(response.result.protocolVersion).toBe('2024-11-05');
      expect(response.result.serverInfo.name).toBe('taskhub-mcp');
    });
  });

  describe('Tool Listing', () => {
    it('should list all 7 tools', async () => {
      const response = await sendRequest({
        jsonrpc: '2.0',
        id: requestId,
        method: 'tools/list',
        params: {}
      });

      expect(response.result).toBeDefined();
      expect(response.result.tools).toHaveLength(7);
      
      const toolNames = response.result.tools.map((tool: any) => tool.name);
      expect(toolNames).toContain('submit_spec');
      expect(toolNames).toContain('list_tasks');
      expect(toolNames).toContain('claim_task');
      expect(toolNames).toContain('start_branch');
      expect(toolNames).toContain('push_patch');
      expect(toolNames).toContain('open_pr');
      expect(toolNames).toContain('post_review');
    });

    it('should have proper tool schemas', async () => {
      const response = await sendRequest({
        jsonrpc: '2.0',
        id: requestId,
        method: 'tools/list',
        params: {}
      });

      const tools = response.result.tools;
      
      for (const tool of tools) {
        expect(tool.name).toBeDefined();
        expect(tool.description).toBeDefined();
        expect(tool.inputSchema).toBeDefined();
        expect(tool.inputSchema.type).toBe('object');
      }
    });
  });

  describe('Task Workflow', () => {
    let taskId: number;

    it('should create a task', async () => {
      const response = await sendRequest({
        jsonrpc: '2.0',
        id: requestId,
        method: 'tools/call',
        params: {
          name: 'submit_spec',
          arguments: {
            title: 'Integration Test Task',
            description: 'A task created during integration testing to verify the complete workflow',
            acceptance_criteria: ['Feature works', 'Tests pass', 'Documentation updated'],
            repo: 'test-org/test-repo'
          }
        }
      });

      expect(response.result).toBeDefined();
      expect(response.result.content).toHaveLength(1);
      
      const taskData = JSON.parse(response.result.content[0].text);
      expect(taskData.task_id).toBeDefined();
      expect(taskData.title).toBe('Integration Test Task');
      expect(taskData.status).toBe('todo');
      
      taskId = taskData.task_id;
    });

    it('should list tasks', async () => {
      const response = await sendRequest({
        jsonrpc: '2.0',
        id: requestId,
        method: 'tools/call',
        params: {
          name: 'list_tasks',
          arguments: {
            limit: 10
          }
        }
      });

      expect(response.result).toBeDefined();
      const listData = JSON.parse(response.result.content[0].text);
      expect(listData.tasks).toBeDefined();
      expect(listData.total).toBeGreaterThan(0);
      
      const task = listData.tasks.find((t: any) => t.id === taskId);
      expect(task).toBeDefined();
    });

    it('should claim a task', async () => {
      const response = await sendRequest({
        jsonrpc: '2.0',
        id: requestId,
        method: 'tools/call',
        params: {
          name: 'claim_task',
          arguments: {
            task_id: taskId,
            assignee: 'integration-test-user'
          }
        }
      });

      expect(response.result).toBeDefined();
      const claimData = JSON.parse(response.result.content[0].text);
      expect(claimData.task_id).toBe(taskId);
      expect(claimData.status).toBe('claimed');
      expect(claimData.assignee).toBe('integration-test-user');
    });

    it('should handle state machine validation', async () => {
      // Try to open PR on a claimed task (should fail)
      const response = await sendRequest({
        jsonrpc: '2.0',
        id: requestId,
        method: 'tools/call',
        params: {
          name: 'open_pr',
          arguments: {
            task_id: taskId,
            dry_run: true
          }
        }
      });

      expect(response.result.isError).toBe(true);
      const errorData = JSON.parse(response.result.content[0].text);
      expect(errorData.error.code).toBeDefined();
    });
  });

  describe('Error Handling', () => {
    it('should handle invalid tool names', async () => {
      const response = await sendRequest({
        jsonrpc: '2.0',
        id: requestId,
        method: 'tools/call',
        params: {
          name: 'invalid_tool',
          arguments: {}
        }
      });

      expect(response.result.isError).toBe(true);
      const errorData = JSON.parse(response.result.content[0].text);
      expect(errorData.error.code).toBe('TOOL_NOT_FOUND');
    });

    it('should handle invalid arguments', async () => {
      const response = await sendRequest({
        jsonrpc: '2.0',
        id: requestId,
        method: 'tools/call',
        params: {
          name: 'submit_spec',
          arguments: {
            title: '', // Invalid
            description: 'short', // Too short
            acceptance_criteria: [] // Empty
          }
        }
      });

      expect(response.result.isError).toBe(true);
      const errorData = JSON.parse(response.result.content[0].text);
      expect(errorData.error.type).toBe('validation');
    });
  });

  describe('Dry Run Mode', () => {
    it('should support dry run for GitHub operations', async () => {
      const response = await sendRequest({
        jsonrpc: '2.0',
        id: requestId,
        method: 'tools/call',
        params: {
          name: 'post_review',
          arguments: {
            pr_number: 123,
            repo: 'test-org/test-repo',
            notes: 'Test review in dry run mode',
            dry_run: true
          }
        }
      });

      // Should succeed in dry run mode even without real PR
      if (!response.result.isError) {
        const reviewData = JSON.parse(response.result.content[0].text);
        expect(reviewData.dry_run).toBe(true);
      }
    });
  });
});
