#!/usr/bin/env node

/**
 * Test the demo token endpoint directly
 */

import http from 'http';

function makeRequest(method, path, body = null) {
  return new Promise((resolve) => {
    const requestData = body ? JSON.stringify(body) : null;
    const requestHeaders = {};

    if (requestData) {
      requestHeaders['Content-Type'] = 'application/json';
      requestHeaders['Content-Length'] = Buffer.byteLength(requestData);
    }

    const requestOptions = {
      hostname: 'localhost',
      port: 3002,
      path: path,
      method: method,
      headers: requestHeaders,
    };

    const req = http.request(requestOptions, (res) => {
      let responseData = '';

      res.on('data', (chunk) => {
        responseData += chunk;
      });

      res.on('end', () => {
        try {
          const parsedData = responseData ? JSON.parse(responseData) : {};
          resolve({
            status: res.statusCode,
            headers: res.headers,
            data: parsedData,
            ok: res.statusCode >= 200 && res.statusCode < 300,
          });
        } catch (error) {
          resolve({
            status: res.statusCode,
            headers: res.headers,
            data: { error: 'Invalid JSON response', raw: responseData },
            ok: false,
          });
        }
      });
    });

    req.on('error', (error) => {
      resolve({
        status: 0,
        error: error.message,
        ok: false,
      });
    });

    if (requestData) {
      req.write(requestData);
    }

    req.end();
  });
}

async function testDemoEndpoint() {
  console.log('🧪 Testing demo token endpoint...');
  
  try {
    const response = await makeRequest('POST', '/auth/demo-token');
    console.log('📊 Response status:', response.status);
    console.log('📋 Response data:', JSON.stringify(response.data, null, 2));
    
    if (response.ok && response.data.token) {
      console.log('✅ Demo token endpoint working!');
      return response.data.token;
    } else {
      console.log('❌ Demo token endpoint failed');
      return null;
    }
  } catch (error) {
    console.error('❌ Request failed:', error.message);
    return null;
  }
}

testDemoEndpoint().catch(console.error);
