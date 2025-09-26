#!/usr/bin/env node

/**
 * TaskHub MCP Server - Complete Happy Path Demo
 * 
 * Demonstrates the complete workflow as specified in AGENT_PROMPTS.md:
 * 1) submit_spec → 2) list_tasks → 3) claim_task → 4) start_branch → 
 * 5) push_patch (two small commits) → 6) open_pr (draft) → 7) post_review (block=true then false)
 */

import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, '..');

console.log('🎬 TaskHub MCP Server - Complete Happy Path Demo');
console.log('📋 Following the exact workflow from AGENT_PROMPTS.md\n');

/**
 * Send a request to the MCP server and parse the response
 */
function sendMcpRequest(server, request) {
  return new Promise((resolve, reject) => {
    const requestStr = JSON.stringify(request) + '\n';
    
    let responseData = '';
    let responseReceived = false;
    
    const timeout = setTimeout(() => {
      if (!responseReceived) {
        reject(new Error('Request timeout'));
      }
    }, 15000);
    
    const dataHandler = (data) => {
      responseData += data.toString();
      
      // Try to parse each line as JSON
      const lines = responseData.split('\n');
      for (let i = 0; i < lines.length - 1; i++) {
        const line = lines[i].trim();
        if (line) {
          try {
            const response = JSON.parse(line);
            if (response.id === request.id) {
              clearTimeout(timeout);
              responseReceived = true;
              server.stdout.off('data', dataHandler);
              resolve(response);
              return;
            }
          } catch (e) {
            // Continue trying to parse
          }
        }
      }
      
      // Keep the last incomplete line
      responseData = lines[lines.length - 1];
    };
    
    server.stdout.on('data', dataHandler);
    server.stdin.write(requestStr);
  });
}

/**
 * Execute the complete happy path workflow
 */
async function runHappyPathDemo() {
  console.log('🚀 Starting MCP server...');
  
  const server = spawn('node', ['dist/server.js'], {
    cwd: projectRoot,
    stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env, NODE_ENV: 'test', DRY_RUN: 'true' }
  });

  // Wait for server to be ready
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error('Server startup timeout'));
    }, 15000);
    
    server.stdout.on('data', (data) => {
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

  console.log('✅ Server started successfully\n');

  try {
    let requestId = 1;

    // Initialize MCP connection
    console.log('📡 Step 0: Initialize MCP connection');
    await sendMcpRequest(server, {
      jsonrpc: '2.0',
      id: requestId++,
      method: 'initialize',
      params: {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'demo-client', version: '1.0.0' }
      }
    });
    console.log('✅ MCP connection initialized\n');

    // Step 1: submit_spec
    console.log('📝 Step 1: submit_spec - Create a new task');
    const taskResponse = await sendMcpRequest(server, {
      jsonrpc: '2.0',
      id: requestId++,
      method: 'tools/call',
      params: {
        name: 'submit_spec',
        arguments: {
          title: 'RequestGrid Component',
          description: 'Create a React grid component with pagination and status filter for displaying request data',
          acceptance_criteria: [
            'pagination(20)',
            'filter by status',
            'ARIA labels',
            'unit tests',
            'responsive design'
          ],
          repo: 'demo-org/frontend-app'
        }
      }
    });
    
    const taskData = JSON.parse(taskResponse.result.content[0].text);
    const taskId = taskData.task_id;
    console.log(`✅ Task created: #${taskId} - ${taskData.title}`);
    console.log(`📊 Status: ${taskData.status}\n`);

    // Step 2: list_tasks
    console.log('📋 Step 2: list_tasks - Verify task in list');
    const listResponse = await sendMcpRequest(server, {
      jsonrpc: '2.0',
      id: requestId++,
      method: 'tools/call',
      params: {
        name: 'list_tasks',
        arguments: {
          status: 'todo',
          limit: 5
        }
      }
    });
    
    const listData = JSON.parse(listResponse.result.content[0].text);
    console.log(`✅ Found ${listData.total} todo tasks`);
    const ourTask = listData.tasks.find(t => t.id === taskId);
    if (ourTask) {
      console.log(`📋 Our task: #${ourTask.id} - ${ourTask.title} (${ourTask.status})\n`);
    }

    // Step 3: claim_task
    console.log('👤 Step 3: claim_task - Assign to developer');
    const claimResponse = await sendMcpRequest(server, {
      jsonrpc: '2.0',
      id: requestId++,
      method: 'tools/call',
      params: {
        name: 'claim_task',
        arguments: {
          task_id: taskId,
          assignee: 'augment-developer'
        }
      }
    });
    
    const claimData = JSON.parse(claimResponse.result.content[0].text);
    console.log(`✅ Task claimed by: ${claimData.assignee}`);
    console.log(`📊 Status: ${claimData.status}\n`);

    // Step 4: start_branch
    console.log('🌿 Step 4: start_branch - Create feature branch');
    const branchResponse = await sendMcpRequest(server, {
      jsonrpc: '2.0',
      id: requestId++,
      method: 'tools/call',
      params: {
        name: 'start_branch',
        arguments: {
          task_id: taskId,
          repo: 'demo-org/frontend-app',
          dry_run: true
        }
      }
    });
    
    const branchData = JSON.parse(branchResponse.result.content[0].text);
    console.log(`✅ Branch created: ${branchData.branch_name}`);
    console.log(`📊 Status: ${branchData.status}`);
    console.log(`🎯 New naming format: feature/{slug}-{task_id} ✨\n`);

    // Step 5a: push_patch (first commit)
    console.log('📤 Step 5a: push_patch - First commit (component structure)');
    const pushResponse1 = await sendMcpRequest(server, {
      jsonrpc: '2.0',
      id: requestId++,
      method: 'tools/call',
      params: {
        name: 'push_patch',
        arguments: {
          task_id: taskId,
          branch_name: branchData.branch_name,
          repo: 'demo-org/frontend-app',
          files: [
            {
              path: 'src/components/RequestGrid/RequestGrid.tsx',
              content: `import React, { useState, useEffect } from 'react';
import { RequestGridProps, RequestItem } from './types';
import { Pagination } from '../Pagination';
import { StatusFilter } from '../StatusFilter';

export const RequestGrid: React.FC<RequestGridProps> = ({
  requests,
  onStatusFilter,
  pageSize = 20
}) => {
  const [currentPage, setCurrentPage] = useState(1);
  const [filteredRequests, setFilteredRequests] = useState(requests);

  // Component implementation here...
  return (
    <div className="request-grid" role="grid" aria-label="Request data grid">
      <StatusFilter onFilter={onStatusFilter} />
      <div className="grid-content">
        {/* Grid implementation */}
      </div>
      <Pagination 
        currentPage={currentPage}
        totalItems={filteredRequests.length}
        pageSize={pageSize}
        onPageChange={setCurrentPage}
      />
    </div>
  );
};`
            },
            {
              path: 'src/components/RequestGrid/types.ts',
              content: `export interface RequestItem {
  id: string;
  title: string;
  status: 'pending' | 'approved' | 'rejected';
  createdAt: Date;
  updatedAt: Date;
}

export interface RequestGridProps {
  requests: RequestItem[];
  onStatusFilter: (status: string | null) => void;
  pageSize?: number;
}`
            }
          ],
          commit_message: 'feat: Add RequestGrid component structure with TypeScript types',
          dry_run: true
        }
      }
    });
    
    const pushData1 = JSON.parse(pushResponse1.result.content[0].text);
    console.log(`✅ First commit: ${pushData1.files_changed} files changed`);
    console.log(`📝 Commit: ${pushData1.commit_message}\n`);

    // Step 5b: push_patch (second commit)
    console.log('📤 Step 5b: push_patch - Second commit (tests and styles)');
    const pushResponse2 = await sendMcpRequest(server, {
      jsonrpc: '2.0',
      id: requestId++,
      method: 'tools/call',
      params: {
        name: 'push_patch',
        arguments: {
          task_id: taskId,
          branch_name: branchData.branch_name,
          repo: 'demo-org/frontend-app',
          files: [
            {
              path: 'src/components/RequestGrid/RequestGrid.test.tsx',
              content: `import { render, screen, fireEvent } from '@testing-library/react';
import { RequestGrid } from './RequestGrid';
import { RequestItem } from './types';

const mockRequests: RequestItem[] = [
  {
    id: '1',
    title: 'Test Request 1',
    status: 'pending',
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01')
  },
  {
    id: '2',
    title: 'Test Request 2',
    status: 'approved',
    createdAt: new Date('2024-01-02'),
    updatedAt: new Date('2024-01-02')
  }
];

describe('RequestGrid', () => {
  it('renders with ARIA labels', () => {
    render(<RequestGrid requests={mockRequests} onStatusFilter={jest.fn()} />);
    expect(screen.getByRole('grid', { name: 'Request data grid' })).toBeInTheDocument();
  });

  it('supports pagination with default page size 20', () => {
    render(<RequestGrid requests={mockRequests} onStatusFilter={jest.fn()} />);
    // Test pagination functionality
  });

  it('filters by status', () => {
    const onStatusFilter = jest.fn();
    render(<RequestGrid requests={mockRequests} onStatusFilter={onStatusFilter} />);
    // Test status filtering
  });
});`
            },
            {
              path: 'src/components/RequestGrid/RequestGrid.module.css',
              content: `.request-grid {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  width: 100%;
}

.grid-content {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
  gap: 1rem;
  min-height: 400px;
}

/* Responsive design */
@media (max-width: 768px) {
  .grid-content {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 480px) {
  .request-grid {
    gap: 0.5rem;
  }
}`
            }
          ],
          commit_message: 'test: Add unit tests and responsive CSS for RequestGrid',
          dry_run: true
        }
      }
    });
    
    const pushData2 = JSON.parse(pushResponse2.result.content[0].text);
    console.log(`✅ Second commit: ${pushData2.files_changed} files changed`);
    console.log(`📝 Commit: ${pushData2.commit_message}\n`);

    // Step 6: open_pr (draft)
    console.log('🔀 Step 6: open_pr - Create draft pull request');
    const prResponse = await sendMcpRequest(server, {
      jsonrpc: '2.0',
      id: requestId++,
      method: 'tools/call',
      params: {
        name: 'open_pr',
        arguments: {
          task_id: taskId,
          repo: 'demo-org/frontend-app',
          draft: true,
          dry_run: true
        }
      }
    });
    
    const prData = JSON.parse(prResponse.result.content[0].text);
    console.log(`✅ PR created: #${prData.pr_number} - ${prData.title}`);
    console.log(`📝 Draft status: ${prData.draft}`);
    console.log(`🔗 URL: ${prData.url}`);
    console.log(`📊 Task status: ${prData.status}`);
    console.log(`📋 Auto-generated checklist from acceptance criteria ✨\n`);

    // Step 7a: post_review (blocking)
    console.log('📝 Step 7a: post_review - Post blocking review');
    const reviewResponse1 = await sendMcpRequest(server, {
      jsonrpc: '2.0',
      id: requestId++,
      method: 'tools/call',
      params: {
        name: 'post_review',
        arguments: {
          task_id: taskId,
          repo: 'demo-org/frontend-app',
          notes: `Initial review feedback:

1. **Pagination**: ✅ Implemented with configurable page size (20 default)
2. **Status Filter**: ✅ Component structure in place
3. **ARIA Labels**: ✅ Proper accessibility attributes added
4. **Unit Tests**: ✅ Test coverage for key functionality
5. **Responsive Design**: ✅ CSS Grid with mobile breakpoints

**Requested Changes:**
- Add error handling for failed API requests
- Implement loading states for better UX
- Add keyboard navigation support
- Consider adding sorting functionality

Please address these items before final approval.`,
          block: true,
          dry_run: true
        }
      }
    });
    
    const reviewData1 = JSON.parse(reviewResponse1.result.content[0].text);
    console.log(`✅ Blocking review posted: ${reviewData1.review_id}`);
    console.log(`🚫 Status: ${reviewData1.status} (blocked: ${reviewData1.block})\n`);

    // Step 7b: post_review (approval)
    console.log('📝 Step 7b: post_review - Post approval review');
    const reviewResponse2 = await sendMcpRequest(server, {
      jsonrpc: '2.0',
      id: requestId++,
      method: 'tools/call',
      params: {
        name: 'post_review',
        arguments: {
          task_id: taskId,
          repo: 'demo-org/frontend-app',
          notes: `All feedback addressed! 🎉

**Final Review:**
✅ Error handling implemented
✅ Loading states added
✅ Keyboard navigation working
✅ All acceptance criteria met
✅ Tests passing
✅ Code quality excellent

**LGTM!** Ready to merge when CI is green. Great work on the RequestGrid component!

**Risk Assessment:** Low risk - well-tested component with good error handling.

**Follow-ups for next iteration:**
- Consider adding export functionality
- Explore virtualization for large datasets`,
          block: false,
          dry_run: true
        }
      }
    });
    
    const reviewData2 = JSON.parse(reviewResponse2.result.content[0].text);
    console.log(`✅ Approval review posted: ${reviewData2.review_id}`);
    console.log(`👍 Status: ${reviewData2.status} (blocked: ${reviewData2.block})\n`);

    // Final verification
    console.log('📊 Final verification: list_tasks');
    const finalListResponse = await sendMcpRequest(server, {
      jsonrpc: '2.0',
      id: requestId++,
      method: 'tools/call',
      params: {
        name: 'list_tasks',
        arguments: {
          limit: 5
        }
      }
    });
    
    const finalListData = JSON.parse(finalListResponse.result.content[0].text);
    const finalTask = finalListData.tasks.find(t => t.id === taskId);
    
    if (finalTask) {
      console.log(`✅ Final task status: ${finalTask.status}`);
      console.log(`👤 Assignee: ${finalTask.assignee}`);
      console.log(`🌿 Branch: ${finalTask.branch}`);
    }

    console.log('\n🎉 HAPPY PATH DEMO COMPLETE! 🎉');
    console.log('\n📋 Workflow Summary:');
    console.log('1. ✅ submit_spec: Created RequestGrid task');
    console.log('2. ✅ list_tasks: Verified task in todo list');
    console.log('3. ✅ claim_task: Assigned to augment-developer');
    console.log('4. ✅ start_branch: Created feature/requestgrid-component-{id} branch');
    console.log('5. ✅ push_patch: Two atomic commits (structure + tests)');
    console.log('6. ✅ open_pr: Draft PR with auto-generated checklist');
    console.log('7. ✅ post_review: Blocking review → Approval review');
    
    console.log('\n🚀 Phase 4.5 Features Demonstrated:');
    console.log('✨ Enhanced branch naming: feature/{slug}-{task_id}');
    console.log('✨ Auto-generated PR checklists from acceptance criteria');
    console.log('✨ State machine enforcement throughout workflow');
    console.log('✨ Block/unblock review functionality');
    
    console.log('\n🔧 All 7 MCP Tools Working:');
    console.log('✅ submit_spec, list_tasks, claim_task, start_branch, push_patch, open_pr, post_review');
    
    console.log('\n🎯 Ready for Production Deployment!');

  } catch (error) {
    console.error('\n❌ Demo failed:', error.message);
    process.exit(1);
  } finally {
    server.kill();
  }
}

// Run the demo
runHappyPathDemo().catch((error) => {
  console.error('❌ Demo suite failed:', error);
  process.exit(1);
});
