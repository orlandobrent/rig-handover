// Shared contract for the morning digest. Section 2 renders this and does not read the log.

export type JobStatus = 'ok' | 'retry' | 'fail';

export type DigestRow = {
  job: string;
  owner: string | null;
  runs: number;
  retries: number;
  lastStatus: JobStatus;
  lastError: string | null;
  firstAt: string;
  lastAt: string;
};

/** Log lines per status. A line that does not parse is `badLines`, not a count. */
export type StatusCounts = { ok: number; retry: number; fail: number };

export type NightDigest = {
  rows: DigestRow[];
  badLines: number;
  counts: StatusCounts;
};

/** No `runs/<night>.jsonl`. Routes answer 404. */
export class NoRunLog extends Error {
  readonly code = 'ENOENT' as const;
  constructor(night: string) {
    super(`no run log for ${night}`);
    this.name = 'NoRunLog';
  }
}

export type ReadNight = (runsDir: string, night: string) => NightDigest;
