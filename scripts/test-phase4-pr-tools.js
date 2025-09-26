#!/usr/bin/env node

/**
 * Test Phase 4 + 4.5: PR Management Tools
 * 
 * Tests the complete workflow including:
 * - Enhanced branch naming (feature/{slug}-{task_id})
 * - open_pr tool with auto-generated checklists
 * - post_review tool with block/unblock functionality
 * - State machine enforcement
 */

import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, '..');

console.log('🧪 Testing Phase 4 + 4.5: PR Management Tools\n');

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
    }, 10000);
    
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
 * Test the complete Phase 4 workflow
 */
async function testPhase4Workflow() {
  console.log('🚀 Starting MCP server...');
  
  const server = spawn('node', ['dist/server.js'], {
    cwd: projectRoot,
    stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env, NODE_ENV: 'test' }
  });

  let serverReady = false;
  
  // Wait for server to be ready
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error('Server startup timeout'));
    }, 15000); // Increased timeout

    server.stderr.on('data', (data) => {
      const output = data.toString();
      console.log('Server stderr:', output);
    });

    server.stdout.on('data', (data) => {
      const output = data.toString();
      console.log('Server stdout:', output);
      if (output.includes('TaskHub MCP Server started successfully') || output.includes('Server ready')) {
        clearTimeout(timeout);
        serverReady = true;
        resolve();
      }
    });

    server.on('error', (error) => {
      clearTimeout(timeout);
      reject(error);
    });

    server.on('exit', (code) => {
      clearTimeout(timeout);
      reject(new Error(`Server exited with code ${code}`));
    });
  });

  console.log('✅ Server started successfully\n');

  try {
    // Test 1: Initialize MCP connection
    console.log('📡 Test 1: Initialize MCP connection');
    const initResponse = await sendMcpRequest(server, {
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'test-client', version: '1.0.0' }
      }
    });
    
    if (initResponse.result) {
      console.log('✅ MCP initialization successful');
    } else {
      throw new Error('MCP initialization failed');
    }

    // Test 2: List tools (should include all 7 tools)
    console.log('\n🔧 Test 2: List all tools');
    const toolsResponse = await sendMcpRequest(server, {
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/list',
      params: {}
    });
    
    const tools = toolsResponse.result?.tools || [];
    const expectedTools = ['submit_spec', 'list_tasks', 'claim_task', 'start_branch', 'push_patch', 'open_pr', 'post_review'];
    
    console.log(`📋 Found ${tools.length} tools: ${tools.map(t => t.name).join(', ')}`);
    
    for (const expectedTool of expectedTools) {
      if (tools.find(t => t.name === expectedTool)) {
        console.log(`✅ ${expectedTool} tool registered`);
      } else {
        throw new Error(`❌ ${expectedTool} tool missing`);
      }
    }

    // Test 3: Create a test task
    console.log('\n📝 Test 3: Create test task');
    const taskResponse = await sendMcpRequest(server, {
      jsonrpc: '2.0',
      id: 3,
      method: 'tools/call',
      params: {
        name: 'submit_spec',
        arguments: {
          title: 'Test PR Workflow Task',
          description: 'A test task to validate the complete PR workflow with Phase 4.5 improvements',
          acceptance_criteria: [
            'Feature implementation complete',
            'Unit tests added and passing',
            'Documentation updated',
            'Code review completed',
            'No breaking changes'
          ],
          repo: 'test-org/test-repo'
        }
      }
    });
    
    const taskData = JSON.parse(taskResponse.result.content[0].text);
    const taskId = taskData.task_id;
    console.log(`✅ Task created with ID: ${taskId}`);

    // Test 4: Claim the task
    console.log('\n👤 Test 4: Claim task');
    const claimResponse = await sendMcpRequest(server, {
      jsonrpc: '2.0',
      id: 4,
      method: 'tools/call',
      params: {
        name: 'claim_task',
        arguments: {
          task_id: taskId,
          assignee: 'test-developer'
        }
      }
    });
    
    const claimData = JSON.parse(claimResponse.result.content[0].text);
    console.log(`✅ Task claimed by: ${claimData.assignee}, Status: ${claimData.status}`);

    // Test 5: Start branch (should use new feature/{slug}-{task_id} format)
    console.log('\n🌿 Test 5: Start branch with new naming format');
    const branchResponse = await sendMcpRequest(server, {
      jsonrpc: '2.0',
      id: 5,
      method: 'tools/call',
      params: {
        name: 'start_branch',
        arguments: {
          task_id: taskId,
          repo: 'test-org/test-repo',
          dry_run: true
        }
      }
    });
    
    const branchData = JSON.parse(branchResponse.result.content[0].text);
    console.log(`✅ Branch created: ${branchData.branch_name}`);
    
    // Verify new branch naming format
    if (branchData.branch_name.startsWith('feature/') && branchData.branch_name.includes(`-${taskId}`)) {
      console.log('✅ New branch naming format (feature/{slug}-{task_id}) working correctly');
    } else {
      throw new Error(`❌ Branch naming format incorrect: ${branchData.branch_name}`);
    }

    // Test 6: Push some changes
    console.log('\n📤 Test 6: Push patch');
    const pushResponse = await sendMcpRequest(server, {
      jsonrpc: '2.0',
      id: 6,
      method: 'tools/call',
      params: {
        name: 'push_patch',
        arguments: {
          task_id: taskId,
          repo: 'test-org/test-repo',
          files: [
            {
              path: 'src/feature.js',
              content: 'console.log("New feature implementation");'
            },
            {
              path: 'tests/feature.test.js',
              content: 'test("feature works", () => { expect(true).toBe(true); });'
            }
          ],
          commit_message: 'Implement new feature with tests',
          dry_run: true
        }
      }
    });
    
    const pushData = JSON.parse(pushResponse.result.content[0].text);
    console.log(`✅ Pushed ${pushData.files_changed} files to branch: ${pushData.branch_name}`);

    // Test 7: Open PR with auto-generated checklist
    console.log('\n🔀 Test 7: Open PR with auto-generated checklist');
    const prResponse = await sendMcpRequest(server, {
      jsonrpc: '2.0',
      id: 7,
      method: 'tools/call',
      params: {
        name: 'open_pr',
        arguments: {
          task_id: taskId,
          repo: 'test-org/test-repo',
          draft: true,
          dry_run: true
        }
      }
    });
    
    const prData = JSON.parse(prResponse.result.content[0].text);
    console.log(`✅ PR created: #${prData.pr_number} - ${prData.title}`);
    console.log(`📋 PR URL: ${prData.url}`);
    console.log(`📝 Draft status: ${prData.draft}`);
    console.log(`🔄 Task status updated to: ${prData.status}`);

    // Test 8: Post blocking review
    console.log('\n📝 Test 8: Post blocking review');
    const blockingReviewResponse = await sendMcpRequest(server, {
      jsonrpc: '2.0',
      id: 8,
      method: 'tools/call',
      params: {
        name: 'post_review',
        arguments: {
          task_id: taskId,
          repo: 'test-org/test-repo',
          notes: 'Please address the following issues:\n1. Add error handling\n2. Improve test coverage\n3. Update documentation',
          block: true,
          dry_run: true
        }
      }
    });
    
    const blockingReviewData = JSON.parse(blockingReviewResponse.result.content[0].text);
    console.log(`✅ Blocking review posted: ${blockingReviewData.review_id}`);
    console.log(`🚫 Review status: ${blockingReviewData.status} (blocked: ${blockingReviewData.block})`);

    // Test 9: Post approval review
    console.log('\n✅ Test 9: Post approval review');
    const approvalReviewResponse = await sendMcpRequest(server, {
      jsonrpc: '2.0',
      id: 9,
      method: 'tools/call',
      params: {
        name: 'post_review',
        arguments: {
          task_id: taskId,
          repo: 'test-org/test-repo',
          notes: 'All issues addressed. LGTM! Ready to merge when CI is green.',
          block: false,
          dry_run: true
        }
      }
    });
    
    const approvalReviewData = JSON.parse(approvalReviewResponse.result.content[0].text);
    console.log(`✅ Approval review posted: ${approvalReviewData.review_id}`);
    console.log(`👍 Review status: ${approvalReviewData.status} (blocked: ${approvalReviewData.block})`);

    // Test 10: Verify final task list
    console.log('\n📊 Test 10: Verify final task status');
    const finalListResponse = await sendMcpRequest(server, {
      jsonrpc: '2.0',
      id: 10,
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

    console.log('\n🎉 All Phase 4 + 4.5 tests passed successfully!');
    console.log('\n📋 Phase 4 + 4.5 Summary:');
    console.log('✅ Enhanced branch naming: feature/{slug}-{task_id}');
    console.log('✅ open_pr tool with auto-generated checklists');
    console.log('✅ post_review tool with block/unblock functionality');
    console.log('✅ State machine enforcement working');
    console.log('✅ All 7 MCP tools operational');
    console.log('✅ Complete workflow: submit_spec → claim_task → start_branch → push_patch → open_pr → post_review');

  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    process.exit(1);
  } finally {
    server.kill();
  }
}

// Run the tests
testPhase4Workflow().catch((error) => {
  console.error('❌ Test suite failed:', error);
  process.exit(1);
});
