import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { join } from 'node:path';
import type { DesktopSnapshot } from '../core/model';
const exec = promisify(execFile);
export async function observeDesktop(): Promise<DesktopSnapshot> {
  if (process.platform !== 'darwin') return { observedAt: Date.now(), windows: [], accessibility: false, error: 'Window location unavailable on this platform / 当前平台暂不支持窗口定位；自动恢复独立运行。' };
  try {
    const { stdout } = await exec(join(__dirname, 'window-observer'), [], { timeout: 4000, maxBuffer: 1024 * 1024 });
    const value = JSON.parse(stdout) as DesktopSnapshot;
    if (!Array.isArray(value.windows) || typeof value.observedAt !== 'number') throw new Error('Invalid observer output');
    return value;
  } catch {
    return { observedAt: Date.now(), windows: [], accessibility: false, error: '窗口观察器不可用；请先运行 npm run build:native。' };
  }
}
