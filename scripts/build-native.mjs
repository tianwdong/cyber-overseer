import { mkdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
if (process.platform === 'darwin') {
  await mkdir('dist', { recursive: true });
  const result = spawnSync('swiftc', ['-O', 'native/WindowObserver.swift', '-o', 'dist/window-observer'], { stdio: 'inherit' });
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
} else {
  console.log('Native window location is currently macOS-only. Automatic recovery runs independently.');
}
