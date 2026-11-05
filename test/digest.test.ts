import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { readNight } from '../src/digest/read.js';
import { NoRunLog } from '../src/digest/types.js';

const temps: string[] = [];

afterEach(() => {
  for (const dir of temps.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function tempRuns(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), 'rig-digest-'));
  temps.push(dir);
  for (const [name, body] of Object.entries(files)) writeFileSync(join(dir, name), body);
  return dir;
}

describe('readNight', () => {
  it('reads 2026-10-28: 5 jobs, 1 bad line', () => {
    const digest = readNight('runs', '2026-10-28');
    expect(digest.badLines).toBe(1);
    expect(digest.counts).toEqual({ ok: 10, retry: 4, fail: 1 });
    expect(digest.rows).toEqual([
      {
        job: 'digest/render',
        owner: null,
        runs: 1,
        retries: 0,
        lastStatus: 'ok',
        lastError: null,
        firstAt: '2026-10-29T05:41:09+01:00',
        lastAt: '2026-10-29T05:41:09+01:00',
      },
      {
        job: 'fixtures/refresh',
        owner: 'rook',
        runs: 4,
        retries: 3,
        lastStatus: 'ok',
        lastError: null,
        firstAt: '2026-10-29T01:30:00+01:00',
        lastAt: '2026-10-29T01:37:00+01:00',
      },
      {
        job: 'lane/sync',
        owner: 'rook',
        runs: 8,
        retries: 1,
        lastStatus: 'ok',
        lastError: null,
        firstAt: '2026-10-28T23:00:06+01:00',
        lastAt: '2026-10-29T05:00:04+01:00',
      },
      {
        job: 'notes/backup',
        owner: 'lane-07',
        runs: 1,
        retries: 0,
        lastStatus: 'fail',
        lastError: 'quota exceeded',
        firstAt: '2026-10-29T04:00:01+01:00',
        lastAt: '2026-10-29T04:00:01+01:00',
      },
      {
        job: 'rig/rotate-logs',
        owner: 'lane-07',
        runs: 1,
        retries: 0,
        lastStatus: 'ok',
        lastError: null,
        firstAt: '2026-10-28T23:00:02+01:00',
        lastAt: '2026-10-28T23:00:02+01:00',
      },
    ]);
  });

  it('keeps a null owner and counts a bad line without throwing', () => {
    const dir = tempRuns({
      '2026-01-02.jsonl': [
        '{"at":"2026-01-02T01:00:00+01:00","job":"a","status":"retry","owner":"rook","error":"nope"}',
        '{"at":"2026-01-02T02:00:00+01:00","job":"a","status":"ok","owner":null}',
        'not json',
        '',
      ].join('\n'),
    });
    const digest = readNight(dir, '2026-01-02');
    expect(digest.badLines).toBe(1);
    expect(digest.rows).toEqual([
      {
        job: 'a',
        owner: null,
        runs: 2,
        retries: 1,
        lastStatus: 'ok',
        lastError: null,
        firstAt: '2026-01-02T01:00:00+01:00',
        lastAt: '2026-01-02T02:00:00+01:00',
      },
    ]);
  });

  it('returns an empty night for an empty file', () => {
    const dir = tempRuns({ '2026-01-03.jsonl': '' });
    expect(readNight(dir, '2026-01-03')).toEqual({
      rows: [],
      badLines: 0,
      counts: { ok: 0, retry: 0, fail: 0 },
    });
  });

  it('throws when the night has no file', () => {
    const dir = tempRuns({});
    expect(() => readNight(dir, '2026-01-04')).toThrow(NoRunLog);
    expect(() => readNight(dir, '../secret')).toThrow(NoRunLog);
  });
});
