export enum Provides {
  Anthropic = 'Anthropic',
}

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
export const MAX_FILE_READ_BYTES = 200_000;
export const MAX_GREP_RESULTS = 50;
