import type { CodexProcess } from '../services/codex-process.js';

// Type definitions
export interface SSEConnection {
  codex: CodexProcess;
  sendChunk: (chunk: string) => void;
  close: () => void;
  threadId?: string;
  heartbeat?: NodeJS.Timeout;
}

export interface PendingRequest {
  type: 'init_alert';
  payload: any;
}

export interface CodexInitParams {
  clientInfo: {
    name: string;
    version: string;
    title: string;
  };
}

export interface CodexThreadParams {
  cwd: string;
  model: string | null;
  modelProvider: string | null;
  approvalPolicy: string;
  sandbox: string;
  config: null;
  baseInstructions: null;
  developerInstructions: null;
}

export interface CodexTurnParams {
  threadId: string;
  input: Array<{ type: string; text: string }>;
  cwd: null;
  approvalPolicy: null;
  sandboxPolicy: null;
  model: string | null;
  effort: null;
  summary: null;
}
