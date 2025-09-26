#!/usr/bin/env node

/**
 * Simple test for the demo token generation
 */

import { generateDemoToken } from '../dist/lib/auth.js';

try {
  console.log('🧪 Testing demo token generation...');
  
  const token = generateDemoToken();
  console.log('✅ Demo token generated successfully:');
  console.log(token);
  
  // Decode the token to see its contents
  const parts = token.split('.');
  if (parts.length === 3) {
    const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString());
    console.log('📋 Token payload:');
    console.log(JSON.stringify(payload, null, 2));
  }
  
} catch (error) {
  console.error('❌ Demo token generation failed:', error.message);
  console.error('Stack:', error.stack);
}
