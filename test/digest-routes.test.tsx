import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import type { Night } from '../src/digest/types.js';

const NORMAL = '2026-10-28';
const EMPTY = '2026-10-27';
const BAD = '2026-10-26';
const MISSING = '2026-10-01';

const line = (at: string, job: string, status: string, owner: string | null, error?: string) =>
  JSON.stringify({ at, job, status, owner, ...(error ? { error } : {}) });

let runsDir: string;

beforeAll(() => {
  runsDir = mkdtempSync(join(tmpdir(), 'digest-routes-'));
  writeFileSync(
    join(runsDir, `${NORMAL}.jsonl`),
    [
      line('2026-10-28T01:00:00+01:00', 'backup-db', 'retry', 'ops-a'),
      line('2026-10-28T01:05:00+01:00', 'backup-db', 'retry', 'ops-a'),
      line('2026-10-28T01:10:00+01:00', 'backup-db', 'retry', 'ops-a'),
      line('2026-10-28T01:15:00+01:00', 'backup-db', 'ok', 'ops-a'),
      line('2026-10-28T02:00:00+01:00', 'export-csv', 'fail', 'ops-b', 'disk full'),
      line('2026-10-28T03:00:00+01:00', 'rotate-logs', 'ok', null),
    ].join('\n'),
  );
  writeFileSync(join(runsDir, `${EMPTY}.jsonl`), '');
  writeFileSync(
    join(runsDir, `${BAD}.jsonl`),
    [
      line('2026-10-26T01:00:00+01:00', 'backup-db', 'ok', 'ops-a'),
      'not json at all',
      line('2026-10-26T02:00:00+01:00', 'rotate-logs', 'ok', null),
    ].join('\n'),
  );
});

afterAll(() => {
  rmSync(runsDir, { recursive: true, force: true });
});

const app = () =>
  createApp({ adapter: 'shim', installed: '2026-10-29T14:06:00+01:00', beatEverySeconds: 60, runsDir });

/** Job names in the order they appear in the HTML table. */
const pageJobs = (html: string) => [...html.matchAll(/<td>(backup-db|export-csv|rotate-logs)<\/td>/g)].map((m) => m[1]);

describe('digest routes', () => {
  it('normal night: page and JSON show the same jobs in the same order', async () => {
    const page = await app().request(`/digest/${NORMAL}`);
    const html = await page.text();
    expect(page.status).toBe(200);
    expect(html).toContain('<td>rotate-logs</td><td>—</td>');

    const api = await app().request(`/api/digest/${NORMAL}`);
    expect(api.status).toBe(200);
    const night = (await api.json()) as Night;
    expect(night.rows.map((r) => r.job)).toEqual(['backup-db', 'export-csv', 'rotate-logs']);
    expect(night.rows[0]).toMatchObject({ runs: 4, retries: 3, lastStatus: 'ok' });
    expect(night.rows[2].owner).toBeNull();

    expect(pageJobs(html)).toEqual(night.rows.map((r) => r.job));
  });

  it('missing night: 404 on both routes', async () => {
    expect((await app().request(`/digest/${MISSING}`)).status).toBe(404);
    expect((await app().request(`/api/digest/${MISSING}`)).status).toBe(404);
  });

  it('empty night: page says nothing ran, JSON has no rows', async () => {
    const page = await app().request(`/digest/${EMPTY}`);
    expect(page.status).toBe(200);
    expect(await page.text()).toContain('nothing ran');

    const api = await app().request(`/api/digest/${EMPTY}`);
    expect(api.status).toBe(200);
    expect(((await api.json()) as Night).rows).toEqual([]);
  });

  it('bad-line night: still 200 with rows, and the bad line is counted', async () => {
    const page = await app().request(`/digest/${BAD}`);
    expect(page.status).toBe(200);
    expect(pageJobs(await page.text())).toEqual(['backup-db', 'rotate-logs']);

    const api = await app().request(`/api/digest/${BAD}`);
    expect(api.status).toBe(200);
    const night = (await api.json()) as Night;
    expect(night.badLines).toBe(1);
    expect(night.rows.map((r) => r.job)).toEqual(['backup-db', 'rotate-logs']);
  });
});
