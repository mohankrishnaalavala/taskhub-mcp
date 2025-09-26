#!/usr/bin/env node

/**
 * Minimal HTTP server test to isolate the issue
 */

import Fastify from 'fastify';

async function testMinimalServer() {
  console.log('🧪 Testing minimal Fastify server...');
  
  try {
    const server = Fastify({
      logger: true
    });
    
    server.get('/', async (request, reply) => {
      return { hello: 'world' };
    });
    
    await server.listen({
      port: 3001,
      host: '0.0.0.0',
    });
    
    console.log('✅ Minimal server started on port 3001');
    
    // Test the server
    const response = await fetch('http://localhost:3001/');
    const data = await response.json();
    console.log('📡 Response:', data);
    
    await server.close();
    console.log('✅ Server closed successfully');
    
  } catch (error) {
    console.error('❌ Minimal server failed:', error.message);
    console.error('Stack:', error.stack);
  }
}

testMinimalServer().catch(console.error);
