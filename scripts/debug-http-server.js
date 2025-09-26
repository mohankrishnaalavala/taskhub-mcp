#!/usr/bin/env node

/**
 * Debug script to isolate HTTP server startup issues
 */

import { config } from '../dist/config/env.js';
import { logger } from '../dist/lib/logger.js';

async function debugHttpServer() {
  console.log('🔍 Debugging HTTP server startup...');
  
  try {
    // Test 1: Import the HTTP server module
    console.log('📦 Importing HTTP server module...');
    const { startHttpServer } = await import('../dist/http/server.js');
    console.log('✅ HTTP server module imported successfully');
    
    // Test 2: Check configuration
    console.log('⚙️ Configuration:');
    console.log('- PORT:', config.PORT);
    console.log('- BASE_PATH:', config.BASE_PATH);
    console.log('- JWT_SECRET:', config.JWT_SECRET ? '[SET]' : '[NOT SET]');
    console.log('- NODE_ENV:', config.NODE_ENV);
    
    // Test 3: Try to start the server
    console.log('🚀 Starting HTTP server...');
    const server = await startHttpServer();
    console.log('✅ HTTP server started successfully!');
    
    // Test 4: Make a test request
    console.log('📡 Testing health endpoint...');
    const response = await fetch('http://localhost:3000/healthz');
    const data = await response.json();
    console.log('📊 Health response:', data);
    
    await server.close();
    console.log('✅ Server closed successfully');
    
  } catch (error) {
    console.error('❌ Debug failed at step:', error.message);
    console.error('📍 Stack trace:', error.stack);
    
    // Additional debugging
    if (error.code) {
      console.error('🔢 Error code:', error.code);
    }
    if (error.errno) {
      console.error('🔢 Error number:', error.errno);
    }
    if (error.syscall) {
      console.error('🔧 System call:', error.syscall);
    }
    if (error.address) {
      console.error('🌐 Address:', error.address);
    }
    if (error.port) {
      console.error('🔌 Port:', error.port);
    }
  }
}

debugHttpServer().catch(console.error);
