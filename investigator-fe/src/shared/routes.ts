export const APIS = {
  sessions: {
    create: () => "/sessions",
    get: (id: string) => `/sessions/${id}`,
    messages: (id: string) => `/sessions/${id}/messages`,
  },
  jobs: {
    get: (id: string) => `/jobs/${id}`,
    events: (id: string) => `/jobs/${id}/events`,
  },
} as const;

export const ROUTES = {
  home: () => "/",
  session: (id: string) => `/sessions/${id}`,
} as const;
