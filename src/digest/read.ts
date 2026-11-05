import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  NoRunLog,
  type DigestRow,
  type JobStatus,
  type NightDigest,
} from './types.js';

const NIGHT = /^\d{4}-\d{2}-\d{2}$/;
const STATUSES = new Set<JobStatus>(['ok', 'retry', 'fail']);

type Event = {
  at: string;
  atMs: number;
  job: string;
  status: JobStatus;
  owner: string | null;
  error: string | null;
};

type Acc = {
  owner: string | null;
  runs: number;
  retries: number;
  lastStatus: JobStatus;
  lastAt: string;
  lastMs: number;
  firstAt: string;
  firstMs: number;
  lastError: string | null;
};

function parseEvent(value: unknown): Event | null {
  if (value === null || typeof value !== 'object') return null;
  const v = value as Record<string, unknown>;
  if (typeof v.at !== 'string' || typeof v.job !== 'string') return null;
  if (typeof v.status !== 'string' || !STATUSES.has(v.status as JobStatus)) return null;
  if (v.owner !== null && typeof v.owner !== 'string') return null;
  if (v.error !== undefined && v.error !== null && typeof v.error !== 'string') return null;
  const atMs = Date.parse(v.at);
  if (Number.isNaN(atMs)) return null;
  return {
    at: v.at,
    atMs,
    job: v.job,
    status: v.status as JobStatus,
    owner: v.owner,
    error: typeof v.error === 'string' ? v.error : null,
  };
}

function fold(acc: Acc, event: Event): void {
  acc.runs += 1;
  if (event.status === 'retry') acc.retries += 1;
  if (event.atMs < acc.firstMs) {
    acc.firstMs = event.atMs;
    acc.firstAt = event.at;
  }
  if (event.atMs >= acc.lastMs) {
    acc.lastMs = event.atMs;
    acc.lastAt = event.at;
    acc.lastStatus = event.status;
    acc.owner = event.owner;
    // The latest line wins. A later ok has no error, so the row's last error is empty.
    acc.lastError = event.error;
  }
}

export function readNight(runsDir: string, night: string): NightDigest {
  if (!NIGHT.test(night)) throw new NoRunLog(night);

  let text: string;
  try {
    text = readFileSync(join(runsDir, `${night}.jsonl`), 'utf8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') throw new NoRunLog(night);
    throw err;
  }

  const byJob = new Map<string, Acc>();
  let badLines = 0;
  const counts = { ok: 0, retry: 0, fail: 0 };

  for (const rawLine of text.split('\n')) {
    const line = rawLine.replace(/\r$/, '');
    if (line === '') continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch {
      badLines += 1;
      continue;
    }
    const event = parseEvent(parsed);
    if (!event) {
      badLines += 1;
      continue;
    }
    counts[event.status] += 1;
    const acc = byJob.get(event.job);
    if (!acc) {
      byJob.set(event.job, {
        owner: event.owner,
        runs: 1,
        retries: event.status === 'retry' ? 1 : 0,
        lastStatus: event.status,
        lastAt: event.at,
        lastMs: event.atMs,
        firstAt: event.at,
        firstMs: event.atMs,
        lastError: event.error,
      });
      continue;
    }
    fold(acc, event);
  }

  const rows: DigestRow[] = [...byJob.entries()]
    .map(([job, acc]) => ({
      job,
      owner: acc.owner,
      runs: acc.runs,
      retries: acc.retries,
      lastStatus: acc.lastStatus,
      lastError: acc.lastError,
      firstAt: acc.firstAt,
      lastAt: acc.lastAt,
    }))
    .sort((a, b) => (a.job < b.job ? -1 : a.job > b.job ? 1 : 0));

  return { rows, badLines, counts };
}
