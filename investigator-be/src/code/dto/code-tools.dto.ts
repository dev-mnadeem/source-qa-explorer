export type ReadFileResult = {
  path: string;
  totalLines: number;
  startLine: number;
  endLine: number;
  truncated: boolean;
  content: string;
};

export type GrepMatch = {
  path: string;
  line: number;
  text: string;
};

export type GrepResult = {
  pattern: string;
  matches: GrepMatch[];
  truncated: boolean;
};

export type DirEntry = {
  name: string;
  type: 'file' | 'dir';
};

export type ListDirResult = {
  path: string;
  entries: DirEntry[];
};

export type FindFilesResult = {
  pattern: string;
  paths: string[];
  truncated: boolean;
};
