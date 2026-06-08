export type Session = {
  id: string;
  githubUrl: string;
  repoOwner: string;
  repoName: string;
  createdAt: string;
};

export type CreateSessionInput = {
  githubUrl: string;
};
