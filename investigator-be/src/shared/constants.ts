export enum RoutePaths {
  Sessions = 'sessions',
  Messages = 'messages',
}

/**
 * Default Bedrock model ID, used when AWS_BEDROCK_INVESTIGATOR_MODEL_ID
 * (or the auditor variant) is not set. Anthropic Claude Sonnet 4.5 inference
 * profile name shape; override per-environment via env vars.
 */
export const DEFAULT_BEDROCK_MODEL_ID =
  'global.anthropic.claude-sonnet-4-5-20250929-v1:0';

export const REPO_CLONE_ROOT = '/tmp/codebase-investigator/repos';

export const MAX_TURNS_PER_INVESTIGATION = 12;

/**
 * Hard ceiling on a downloaded repository archive. Repos are fetched from an
 * untrusted source, so the stream is aborted the moment it exceeds this rather
 * than trusting Content-Length (which a hostile origin controls).
 */
export const MAX_REPO_ARCHIVE_BYTES = 150 * 1024 * 1024;

/** Clones older than this are evicted to stop /tmp growing without bound. */
export const REPO_CACHE_TTL_MS = 6 * 60 * 60 * 1000;

/**
 * How many prior turns of a conversation are replayed to the model. Older
 * turns are dropped oldest-first so a long session cannot grow the prompt
 * without limit (and with it, latency and cost).
 */
export const MAX_HISTORY_MESSAGES = 20;
export const MAX_FILE_READ_BYTES = 200_000;
export const MAX_GREP_RESULTS = 50;
