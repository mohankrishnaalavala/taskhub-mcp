import { beforeAll, afterAll, beforeEach } from 'vitest';
import { config } from '@/config/env.js';
import { initializeDatabase, closeDatabase, prisma } from '@/lib/database.js';

// Set test environment
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = 'file:./test.db';
process.env.LOG_LEVEL = 'error'; // Reduce log noise in tests

beforeAll(async () => {
  // Initialize test database
  await initializeDatabase();
});

afterAll(async () => {
  // Clean up test database
  await closeDatabase();
});

beforeEach(async () => {
  // Clean up database before each test
  await prisma.event.deleteMany();
  await prisma.artifact.deleteMany();
  await prisma.task.deleteMany();
});
