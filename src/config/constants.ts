export const SERVER_CONFIG = {
  PORT: 8081,
  HOST: '0.0.0.0',
  VERSION: '2.0.0',
  NAME: 'sre-agent-server',
  HEARTBEAT_INTERVAL: 15000, // 15 seconds
} as const;

export const REQUEST_IDS = {
  INIT: 1,
  THREAD_START: 2,
} as const;

export const DEFAULT_CODEX_CONFIG = {
  CWD: '/tmp',
  APPROVAL_POLICY: 'onRequest',
  SANDBOX: 'dangerFullAccess',
} as const;
