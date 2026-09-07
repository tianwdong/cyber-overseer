import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
export function testIpcPath(dir: string) {
  return process.platform === 'win32' ? String.raw`\\.\pipe\cyber-overseer-test-${randomUUID()}` : join(dir, 'ipc.sock');
}
