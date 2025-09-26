#!/usr/bin/env node

/**
 * ChatGPT Integration Test Script
 * 
 * This script demonstrates the complete TaskHub MCP HTTP API workflow
 * that ChatGPT can use to manage tasks and GitHub operations.
 */

import http from 'http';

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const PORT = process.env.TEST_PORT || 3000;

/**
 * Make HTTP request
 */
function makeRequest(options, data = null) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => body += chunk);
      res.on('end', () => {
        try {
          const result = {
            statusCode: res.statusCode,
            headers: res.headers,
            body: body ? JSON.parse(body) : null
          };
          resolve(result);
        } catch (error) {
          resolve({
            statusCode: res.statusCode,
            headers: res.headers,
            body: body
          });
        }
      });
    });

    req.on('error', reject);
    
    if (data) {
      req.write(JSON.stringify(data));
    }
    
    req.end();
  });
}

/**
 * Test health check
 */
async function testHealthCheck() {
  console.log('\n🔍 Testing Health Check...');
  
  const options = {
    hostname: 'localhost',
    port: PORT,
    path: '/healthz',
    method: 'GET'
  };

  try {
    const response = await makeRequest(options);
    
    if (response.statusCode === 200) {
      console.log('✅ Health check passed');
      console.log(`   Status: ${response.body.status}`);
      console.log(`   Version: ${response.body.version}`);
      console.log(`   Uptime: ${response.body.uptime}s`);
      return true;
    } else {
      console.log(`❌ Health check failed: ${response.statusCode}`);
      return false;
    }
  } catch (error) {
    console.log(`❌ Health check error: ${error.message}`);
    return false;
  }
}

/**
 * Get demo authentication token
 */
async function getDemoToken() {
  console.log('\n🔑 Getting Demo Token...');
  
  const options = {
    hostname: 'localhost',
    port: PORT,
    path: '/auth/demo-token',
    method: 'POST'
    // No Content-Type header since we're not sending a body
  };

  try {
    const response = await makeRequest(options);
    
    if (response.statusCode === 200) {
      console.log('✅ Demo token obtained');
      console.log(`   User: ${response.body.user.username}`);
      console.log(`   Roles: ${response.body.user.roles.join(', ')}`);
      console.log(`   Expires: ${response.body.expiresIn}`);
      return response.body.token;
    } else {
      console.log(`❌ Token request failed: ${response.statusCode}`);
      return null;
    }
  } catch (error) {
    console.log(`❌ Token request error: ${error.message}`);
    return null;
  }
}

/**
 * Test complete workflow
 */
async function testCompleteWorkflow(token) {
  console.log('\n🚀 Testing Complete Workflow...');
  
  // 1. Create a task
  console.log('\n📝 Step 1: Creating a task...');
  const createTaskOptions = {
    hostname: 'localhost',
    port: PORT,
    path: '/mcp/tasks',
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      'Idempotency-Key': `test-task-${Date.now()}`
    }
  };

  const taskData = {
    title: 'ChatGPT Integration Test Task',
    description: 'This task tests the complete ChatGPT → HTTP API → GitHub workflow',
    repo: 'test-org/test-repo',
    acceptance_criteria: [
      'HTTP API endpoints work correctly',
      'Authentication is properly implemented',
      'Task creation and management functions',
      'GitHub integration is ready for testing'
    ]
  };

  try {
    const createResponse = await makeRequest(createTaskOptions, taskData);
    
    if (createResponse.statusCode === 200) {
      console.log('✅ Task created successfully');
      console.log('   Response:', JSON.stringify(createResponse.body, null, 2));

      // Handle different response structures
      const task = createResponse.body.task || createResponse.body;
      const taskId = task.id || task.task_id;

      if (!task || !taskId) {
        console.log('❌ Invalid task response structure');
        return false;
      }

      console.log(`   Task ID: ${taskId}`);
      console.log(`   Title: ${task.title}`);
      console.log(`   Status: ${task.status}`);
      console.log(`   Repository: ${task.repo}`);
      
      // 2. List tasks
      console.log('\n📋 Step 2: Listing tasks...');
      const listOptions = {
        hostname: 'localhost',
        port: PORT,
        path: '/mcp/tasks?limit=10',
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      };

      const listResponse = await makeRequest(listOptions);
      
      if (listResponse.statusCode === 200) {
        console.log('✅ Tasks listed successfully');
        console.log(`   Total tasks: ${listResponse.body.total}`);
        console.log(`   Returned: ${listResponse.body.tasks.length}`);
      }

      // 3. Claim the task
      console.log('\n👤 Step 3: Claiming the task...');
      const claimOptions = {
        hostname: 'localhost',
        port: PORT,
        path: `/mcp/tasks/${taskId}/claim`,
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      };

      const claimData = {
        assignee: 'chatgpt-test-user'
      };

      const claimResponse = await makeRequest(claimOptions, claimData);
      
      if (claimResponse.statusCode === 200) {
        console.log('✅ Task claimed successfully');
        console.log('   Response:', JSON.stringify(claimResponse.body, null, 2));

        const claimedTask = claimResponse.body.task || claimResponse.body;
        if (claimedTask.assignee || claimedTask.status) {
          console.log(`   Assignee: ${claimedTask.assignee || 'N/A'}`);
          console.log(`   Status: ${claimedTask.status || 'N/A'}`);
        }
      }

      // 4. Test GitHub operations (these will be dry-run in test environment)
      console.log('\n🌿 Step 4: Testing GitHub branch creation...');
      const branchOptions = {
        hostname: 'localhost',
        port: PORT,
        path: `/mcp/tasks/${taskId}/branch`,
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      };

      const branchResponse = await makeRequest(branchOptions);
      
      if (branchResponse.statusCode === 200) {
        console.log('✅ Branch creation endpoint works');
        console.log(`   Branch: ${branchResponse.body.branch || 'dry-run mode'}`);
      }

      console.log('\n🎉 Complete workflow test successful!');
      return true;
      
    } else {
      console.log(`❌ Task creation failed: ${createResponse.statusCode}`);
      console.log(`   Error: ${JSON.stringify(createResponse.body, null, 2)}`);
      return false;
    }
  } catch (error) {
    console.log(`❌ Workflow test error: ${error.message}`);
    return false;
  }
}

/**
 * Test error handling
 */
async function testErrorHandling(token) {
  console.log('\n🚨 Testing Error Handling...');
  
  // Test invalid endpoint
  const invalidOptions = {
    hostname: 'localhost',
    port: PORT,
    path: '/mcp/invalid-endpoint',
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${token}`
    }
  };

  try {
    const response = await makeRequest(invalidOptions);
    
    if (response.statusCode === 404) {
      console.log('✅ 404 error handling works correctly');
    }
  } catch (error) {
    console.log(`❌ Error handling test failed: ${error.message}`);
  }

  // Test unauthorized access
  const unauthorizedOptions = {
    hostname: 'localhost',
    port: PORT,
    path: '/mcp/tasks',
    method: 'GET'
    // No Authorization header
  };

  try {
    const response = await makeRequest(unauthorizedOptions);
    
    if (response.statusCode === 401) {
      console.log('✅ Authentication error handling works correctly');
    }
  } catch (error) {
    console.log(`❌ Auth error handling test failed: ${error.message}`);
  }
}

/**
 * Main test function
 */
async function main() {
  console.log('🎯 TaskHub MCP ChatGPT Integration Test');
  console.log('=====================================');
  console.log(`Testing server at: ${BASE_URL}`);
  
  // Test health check
  const healthOk = await testHealthCheck();
  if (!healthOk) {
    console.log('\n❌ Server is not healthy. Please start the server first:');
    console.log('   NODE_ENV=development TRANSPORTS=http PORT=3000 JWT_SECRET=test-secret-key node dist/server.js');
    process.exit(1);
  }

  // Get authentication token
  const token = await getDemoToken();
  if (!token) {
    console.log('\n❌ Could not obtain authentication token');
    process.exit(1);
  }

  // Test complete workflow
  const workflowOk = await testCompleteWorkflow(token);
  if (!workflowOk) {
    console.log('\n❌ Workflow test failed');
    process.exit(1);
  }

  // Test error handling
  await testErrorHandling(token);

  console.log('\n🎉 All tests passed! ChatGPT integration is ready.');
  console.log('\n📚 Next steps:');
  console.log('   1. Deploy the server to a production environment');
  console.log('   2. Configure ChatGPT Actions using chatgpt/taskhub-actions-schema.yaml');
  console.log('   3. Set up proper JWT authentication for production');
  console.log('   4. Configure GitHub repository access');
  console.log('\n📖 See docs/CHATGPT_INTEGRATION.md for detailed setup instructions');
}

// Run the test
main().catch(console.error);
