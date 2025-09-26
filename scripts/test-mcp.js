#!/usr/bin/env node

/**
 * Simple test script to verify MCP server functionality
 * This script tests the MCP server by sending JSON-RPC messages via stdio
 */

import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, '..');

// Test messages
const testMessages = [
  // Initialize
  {
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: {
        name: 'test-client',
        version: '1.0.0'
      }
    }
  },
  
  // List tools
  {
    jsonrpc: '2.0',
    id: 2,
    method: 'tools/list',
    params: {}
  },
  
  // Test submit_spec tool
  {
    jsonrpc: '2.0',
    id: 3,
    method: 'tools/call',
    params: {
      name: 'submit_spec',
      arguments: {
        title: 'Test Task',
        description: 'This is a test task for MCP server verification',
        requirements: ['Requirement 1', 'Requirement 2'],
        acceptance_criteria: ['Criteria 1', 'Criteria 2'],
        priority: 'medium',
        estimated_hours: 4,
        repo: 'test/repo',
        labels: ['test', 'mcp']
      }
    }
  },
  
  // Test list_tasks tool
  {
    jsonrpc: '2.0',
    id: 4,
    method: 'tools/call',
    params: {
      name: 'list_tasks',
      arguments: {
        status: 'todo',
        limit: 10
      }
    }
  }
];

async function testMCPServer() {
  console.log('🚀 Starting MCP Server test...\n');
  
  // Start the MCP server
  const serverProcess = spawn('node', ['dist/server.js'], {
    cwd: projectRoot,
    stdio: ['pipe', 'pipe', 'pipe'],
    env: {
      ...process.env,
      NODE_ENV: 'test',
      DATABASE_URL: 'file:./test.db',
      LOG_LEVEL: 'error'
    }
  });
  
  let responseCount = 0;
  const responses = [];
  
  // Handle server output
  serverProcess.stdout.on('data', (data) => {
    const lines = data.toString().split('\n').filter(line => line.trim());
    
    for (const line of lines) {
      try {
        const response = JSON.parse(line);
        responses.push(response);
        responseCount++;
        
        console.log(`📨 Response ${responseCount}:`, JSON.stringify(response, null, 2));
        
        // If we've received all expected responses, finish the test
        if (responseCount >= testMessages.length) {
          setTimeout(() => {
            console.log('\n✅ Test completed successfully!');
            console.log(`📊 Received ${responseCount} responses`);
            serverProcess.kill();
            process.exit(0);
          }, 100);
        }
      } catch (error) {
        console.log('📝 Server output:', line);
      }
    }
  });
  
  // Handle server errors
  serverProcess.stderr.on('data', (data) => {
    console.error('❌ Server error:', data.toString());
  });
  
  // Handle server exit
  serverProcess.on('exit', (code) => {
    console.log(`🔚 Server exited with code ${code}`);
    if (code !== 0) {
      process.exit(1);
    }
  });
  
  // Wait a bit for server to start
  await new Promise(resolve => setTimeout(resolve, 1000));
  
  // Send test messages
  for (let i = 0; i < testMessages.length; i++) {
    const message = testMessages[i];
    console.log(`📤 Sending message ${i + 1}:`, JSON.stringify(message, null, 2));
    
    serverProcess.stdin.write(JSON.stringify(message) + '\n');
    
    // Wait between messages
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  
  // Set a timeout to kill the process if it doesn't respond
  setTimeout(() => {
    console.log('⏰ Test timeout - killing server');
    serverProcess.kill();
    process.exit(1);
  }, 10000);
}

// Run the test
testMCPServer().catch(error => {
  console.error('💥 Test failed:', error);
  process.exit(1);
});
