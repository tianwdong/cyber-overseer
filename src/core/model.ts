import type {Settings,Language,RetryProgress} from './settings';
import type { LiveState } from './live-state';
import type { CharacterId } from './characters';
export interface Rect { x: number; y: number; width: number; height: number }
export interface Task {
  id: string; title: string; cwd: string;
  status: 'unknown' | 'running' | 'retrying' | 'failed' | 'completed' | 'waiting';
  updatedAt: number;
  error?: string;
  turnId?: string;
  endedAt?: number;
  resultExcerpt?: string;
  errorCode?: string;
  isCompaction?: boolean;
}
export interface WindowEvidence {
  id: number; pid: number; bundleId: string; bounds: Rect;
  visible: boolean; minimized: boolean; routes: string[];
  selectedLinks: Array<{ url: string; bounds: Rect }>;
}
export interface DesktopSnapshot {
  observedAt: number; accessibility: boolean; windows: WindowEvidence[]; error?: string;
}
export type Location =
  | { kind: 'located'; threadId: string; windowId: number; pid: number; bounds: Rect; row?: Rect; evidence: 'route' | 'selected-link' }
  | { kind: 'unlocated'; reason: 'permission' | 'stale' | 'hidden' | 'ambiguous' | 'unavailable' };
export interface OverseerState {
  settings?:Settings;language?:Language;retryProgress?:Record<string,RetryProgress>;
  character: CharacterId;
  mode: 'demo' | 'live'; tasks: Task[]; selectedId: string | null;
  location: Location; phase: 'idle' | 'walking' | 'watching' | 'whipping';
  message: string; snapshotAgeMs: number | null; inventoryError?: string;
  watchingIds: string[];
  usageOverview?:import('./usage-overview').UsageOverview;
  usageError?:boolean;
  accountSupply?:import('./supply').AccountSupply|null;
  inbox?:import('../main/completion-inbox').CompletionEntry[];
  inboxError?:boolean;
  duty?:import('../main/duty-journal').DutyEntry[];
  health?:{discoveredAt?:number;dispatchAt?:number;journalError?:boolean;discoveryFailedAt?:number;connectionSince?:Record<string,number>;taskErrors?:Record<string,Partial<Record<'read'|'dispatch'|'storage'|'owner',number>>>};
  autoAll?:boolean;
  pausedIds?:string[];recoveringIds?:string[];
  recoveryMessages?:Record<string,string>;
  recoveryMessage?: string;
  liveStates?: Record<string,LiveState>;
}
export function threadIdFromRoute(raw: string): string | null {
  try {
    const u = new URL(raw);
    if (!['codex:', 'app:', 'https:', 'http:'].includes(u.protocol)) return null;
    if (['http:', 'https:'].includes(u.protocol) && !['localhost', '127.0.0.1', 'codex'].includes(u.hostname)) return null;
    const route = u.protocol === 'codex:' ? `/${u.hostname}${u.pathname}` : u.pathname;
    const m = /^\/threads?\/([0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12})\/?$/i.exec(route);
    return m?.[1].toLowerCase() ?? null;
  } catch { return null; }
}
export function locateTask(threadId: string, snapshot: DesktopSnapshot, now = Date.now()): Location {
  if (snapshot.error) return { kind: 'unlocated', reason: 'unavailable' };
  if (!snapshot.accessibility) return { kind: 'unlocated', reason: 'permission' };
  if (now - snapshot.observedAt > 2000 || now < snapshot.observedAt - 100) return { kind: 'unlocated', reason: 'stale' };
  const matches: Extract<Location, {kind: 'located'}>[] = [];
  for (const w of snapshot.windows) {
    if (w.bundleId !== 'com.openai.codex' || !w.visible || w.minimized || w.bounds.width <= 0 || w.bounds.height <= 0) continue;
    const routes = new Set(w.routes.map(threadIdFromRoute).filter(Boolean));
    const links = w.selectedLinks.map(l => ({ id: threadIdFromRoute(l.url), bounds: l.bounds })).filter(l => l.id);
    const ids = new Set([...routes, ...links.map(l => l.id)]);
    if (ids.has(threadId) && ids.size > 1) return { kind: 'unlocated', reason: 'ambiguous' };
    if (ids.size === 1 && ids.has(threadId)) {
      matches.push({ kind: 'located', threadId, windowId: w.id, pid: w.pid, bounds: w.bounds,
        row: links.find(l => l.id === threadId)?.bounds, evidence: routes.has(threadId) ? 'route' : 'selected-link' });
    }
  }
  if (matches.length > 1) return { kind: 'unlocated', reason: 'ambiguous' };
  return matches[0] ?? { kind: 'unlocated', reason: 'hidden' };
}
// Coordinates are logical desktop points, including negative displays.
export function edgeAnchor(window: Rect, workArea: Rect, row?: Rect): { x: number; y: number; side: 'left' | 'right' } {
  const margin = 12, half = 44;
  const side = window.x - half * 2 - margin >= workArea.x ? 'left' : 'right';
  const x = side === 'left' ? window.x - half - margin : window.x + window.width + half + margin;
  const y = row ? row.y + row.height / 2 : window.y + Math.min(170, window.height * 0.35);
  return { side, x: clamp(x, workArea.x + half, workArea.x + workArea.width - half),
    y: clamp(y, workArea.y + 80, workArea.y + workArea.height - 65) };
}
function clamp(v: number, low: number, high: number) { return Math.max(low, Math.min(high, v)); }
export function normalizeError(event: unknown): 'wait' | 'recoverable' | 'manual' | null {
  if (!event || typeof event !== 'object') return null;
  const e = event as { method?: string; params?: { willRetry?: boolean; error?: { codexErrorInfo?: unknown } } };
  if (e.method !== 'error' || !e.params?.error) return null;
  if (e.params.willRetry === true) return 'wait';
  if (e.params.willRetry !== false) return 'manual';
  const info = e.params.error.codexErrorInfo;
  const code = typeof info === 'string' ? info : info && typeof info === 'object' ? Object.keys(info)[0] : '';
  return ['httpConnectionFailed', 'responseStreamConnectionFailed', 'responseStreamDisconnected', 'responseTooManyFailedAttempts', 'serverOverloaded', 'internalServerError'].includes(code || '') ? 'recoverable' : 'manual';
}
