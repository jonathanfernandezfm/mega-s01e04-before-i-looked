// Plan morning-digest § 1. The contract every part of § 2 builds against.

export type RunStatus = 'ok' | 'retry' | 'fail';

/** One line of runs/<night>.jsonl, after parsing. */
export type RunLine = {
  at: string;
  job: string;
  status: RunStatus;
  owner: string | null;
  error?: string;
};

/** One row per job for the night. Times keep the log's offset. */
export type DigestRow = {
  job: string;
  /** Owner of the job's last line; null renders as `—`. */
  owner: string | null;
  runs: number;
  retries: number;
  lastStatus: RunStatus;
  /** Error of the last line that had one; null renders as `—`. */
  lastError: string | null;
  first: string;
  last: string;
};

/** A night read from disk: rows sorted by job, and the lines that did not parse. */
export type Night = {
  night: string;
  rows: DigestRow[];
  badLines: number;
};

/** Returns null when runs/<night>.jsonl does not exist (404); an empty file gives rows: []. */
export type ReadNight = (runsDir: string, night: string) => Night | null;
