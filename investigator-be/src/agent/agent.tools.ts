import type Anthropic from '@anthropic-ai/sdk';

/**
 * Tool definitions handed to the Anthropic API. Each `name` matches a method
 * on AgentService that knows how to dispatch it against CodeService.
 */
export const AGENT_TOOLS: Anthropic.Tool[] = [
  {
    name: 'list_dir',
    description:
      'List files and folders in a directory of the cloned repo. Use to explore the project structure. Path is relative to repo root; use "." for the root.',
    input_schema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description:
            'Directory path relative to repo root. Use "." for repo root.',
        },
      },
      required: ['path'],
    },
  },
  {
    name: 'read_file',
    description:
      'Read a file (or a specific line range) from the cloned repo. Use this to inspect actual code before drawing conclusions. Always prefer reading line ranges over whole files.',
    input_schema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'File path relative to repo root.',
        },
        line_start: {
          type: 'integer',
          description: 'Optional 1-indexed start line (inclusive).',
        },
        line_end: {
          type: 'integer',
          description: 'Optional 1-indexed end line (inclusive).',
        },
      },
      required: ['path'],
    },
  },
  {
    name: 'grep',
    description:
      'Search for a literal pattern across the repo. Returns up to 50 matches with file path and line number. Use this to locate where symbols / strings / functions are defined or referenced.',
    input_schema: {
      type: 'object',
      properties: {
        pattern: {
          type: 'string',
          description: 'Literal text or regex-escaped pattern to search for.',
        },
        glob: {
          type: 'string',
          description:
            'Optional glob to limit files (e.g. "**/*.ts", "src/**/*.py").',
        },
        case_insensitive: {
          type: 'boolean',
          description: 'Whether to match case-insensitively. Defaults to false.',
        },
      },
      required: ['pattern'],
    },
  },
  {
    name: 'find_files',
    description:
      'Find files whose path contains the given substring. Use to locate files by name when you do not know the exact path.',
    input_schema: {
      type: 'object',
      properties: {
        pattern: {
          type: 'string',
          description: 'Substring to match against file paths.',
        },
      },
      required: ['pattern'],
    },
  },
  {
    name: 'submit_answer',
    description:
      'Call this once you have enough evidence to answer the user. The answer must be grounded in citations to specific files and line ranges you have actually read. Do NOT call this until you have used read_file at least once on the relevant code.',
    input_schema: {
      type: 'object',
      properties: {
        answer: {
          type: 'string',
          description:
            'The natural-language answer for the user. Reference files inline like `src/auth.ts:34-58` so the user can cross-check. Be specific — point at functions, lines, behaviors. If you did not find a definitive answer, say so plainly instead of guessing.',
        },
        citations: {
          type: 'array',
          description:
            'List of citations supporting the answer. Every claim should map to at least one citation.',
          items: {
            type: 'object',
            properties: {
              file_path: { type: 'string' },
              line_start: { type: 'integer', minimum: 1 },
              line_end: { type: 'integer', minimum: 1 },
            },
            required: ['file_path', 'line_start', 'line_end'],
          },
        },
      },
      required: ['answer', 'citations'],
    },
  },
];
