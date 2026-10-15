import { test, expect } from '@playwright/test';
import { runIfEnv } from '../../../env/runIfEnv.ts';

test.describe('dev only', () => {
  runIfEnv(test, ['dev']);
  test('runs on dev', () => {
    expect(true).toBe(true);
  });
});

test.describe('prod only', () => {
  runIfEnv(test, ['prod']);
  test('runs on prod', () => {
    expect(true).toBe(true);
  });
});

test.describe('dev and prod', () => {
  runIfEnv(test, ['dev', 'prod']);
  test('runs on both', () => {
    expect(true).toBe(true);
  });
});
