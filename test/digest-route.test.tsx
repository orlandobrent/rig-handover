import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import type { RigConfig } from '../src/config.js';

const EM_DASH = '\u2014';
const temps: string[] = [];

afterEach(() => {
  for (const dir of temps.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function tempRuns(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), 'rig-digest-route-'));
  temps.push(dir);
  for (const [name, body] of Object.entries(files)) writeFileSync(join(dir, name), body);
  return dir;
}

function appWithRuns(files: Record<string, string>) {
  const runsDir = tempRuns(files);
  const config: RigConfig = {
    adapter: 'shim',
    installed: '2026-10-29T14:06:00+01:00',
    beatEverySeconds: 60,
    runsDir,
  };
  return createApp(config);
}

function jobNamesInHtml(html: string): string[] {
  const tbody = html.match(/<tbody>([\s\S]*?)<\/tbody>/)?.[1] ?? '';
  const names: string[] = [];
  for (const row of tbody.matchAll(/<tr[^>]*>[\s\S]*?<td>([^<]+)<\/td>/g)) {
    names.push(row[1]!);
  }
  return names;
}

describe('digest routes', () => {
  it('returns 404 when the night has no file', async () => {
    const app = appWithRuns({});
    const page = await app.request('/digest/2026-01-04');
    const json = await app.request('/api/digest/2026-01-04');
    expect(page.status).toBe(404);
    expect(json.status).toBe(404);
  });

  it('renders an empty night on the page and as JSON', async () => {
    const app = appWithRuns({ '2026-01-03.jsonl': '' });
    const page = await app.request('/digest/2026-01-03');
    const html = await page.text();
    expect(page.status).toBe(200);
    expect(html).toContain('nothing ran');
    expect(html.match(/nothing ran/g)?.length).toBe(1);

    const json = await app.request('/api/digest/2026-01-03');
    expect(json.status).toBe(200);
    expect(await json.json()).toEqual({
      rows: [],
      badLines: 0,
      counts: { ok: 0, retry: 0, fail: 0 },
    });
  });

  it('keeps a good line when another line is not JSON', async () => {
    const app = appWithRuns({
      '2026-01-02.jsonl': [
        '{"at":"2026-01-02T02:00:00+01:00","job":"alpha","status":"ok","owner":null}',
        'not json',
      ].join('\n'),
    });
    const page = await app.request('/digest/2026-01-02');
    const html = await page.text();
    expect(page.status).toBe(200);
    expect(html).toContain('alpha');

    const json = await app.request('/api/digest/2026-01-02');
    expect(json.status).toBe(200);
    const body = await json.json();
    expect(body.badLines).toBe(1);
    expect(body.rows).toHaveLength(1);
    expect(body.rows[0].job).toBe('alpha');
  });

  it('sorts jobs the same on the page and in JSON', async () => {
    const app = appWithRuns({
      '2026-01-05.jsonl': [
        '{"at":"2026-01-05T01:00:00+01:00","job":"zebra","status":"ok","owner":"z"}',
        '{"at":"2026-01-05T02:00:00+01:00","job":"alpha","status":"ok","owner":"a"}',
      ].join('\n'),
    });
    const page = await app.request('/digest/2026-01-05');
    const html = await page.text();
    expect(page.status).toBe(200);
    expect(jobNamesInHtml(html)).toEqual(['alpha', 'zebra']);

    const json = await app.request('/api/digest/2026-01-05');
    const body = await json.json();
    expect(body.rows.map((r: { job: string }) => r.job)).toEqual(['alpha', 'zebra']);
  });

  it('shows null owner and last error as em dashes and marks warn rows', async () => {
    const app = appWithRuns({
      '2026-01-06.jsonl': [
        '{"at":"2026-01-06T01:00:00+01:00","job":"quiet","status":"ok","owner":null}',
        '{"at":"2026-01-06T02:00:00+01:00","job":"noisy","status":"retry","owner":"rook"}',
        '{"at":"2026-01-06T03:00:00+01:00","job":"noisy","status":"retry","owner":"rook"}',
        '{"at":"2026-01-06T04:00:00+01:00","job":"noisy","status":"retry","owner":"rook"}',
        '{"at":"2026-01-06T05:00:00+01:00","job":"broken","status":"fail","owner":"lane","error":"boom"}',
      ].join('\n'),
    });
    const page = await app.request('/digest/2026-01-06');
    const html = await page.text();
    expect(page.status).toBe(200);
    expect(html).toContain(`<h1>2026-01-06</h1>`);
    expect(html).toContain(EM_DASH);
    expect(html).toMatch(/<tr class="warn"><td>broken<\/td>/);
    expect(html).toMatch(/<tr class="warn"><td>noisy<\/td>/);
    expect(html).toMatch(/<tr><td>quiet<\/td>/);
    expect(html).not.toMatch(/<tr class="warn"><td>quiet<\/td>/);
  });

  it('wraps the digest in the lane layout', async () => {
    process.env.LANE_MARKER = 'DIGEST-MARKER';
    const app = appWithRuns({
      '2026-01-07.jsonl':
        '{"at":"2026-01-07T01:00:00+01:00","job":"lane/sync","status":"ok","owner":"rook"}',
    });
    const res = await app.request('/digest/2026-01-07');
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(html).toContain('DIGEST-MARKER');
    expect(html).toContain('lane-07');
  });
});
