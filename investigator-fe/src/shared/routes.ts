export const APIS = {
  sessions: {
    create: () => "/sessions",
    get: (id: string) => `/sessions/${id}`,
    messages: (id: string) => `/sessions/${id}/messages`,
  },
} as const;

export const ROUTES = {
  home: () => "/",
  session: (id: string) => `/sessions/${id}`,
} as const;
