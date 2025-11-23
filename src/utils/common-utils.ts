import { SERVER_CONFIG, DEFAULT_CODEX_CONFIG } from '../config/constants.js';
import type { CodexInitParams, CodexThreadParams, CodexTurnParams } from '../types/index.js';

export function createInitParams(): CodexInitParams {
  return {
    clientInfo: {
      name: SERVER_CONFIG.NAME,
      version: SERVER_CONFIG.VERSION,
      title: 'Server Init',
    },
  };
}

export function createThreadParams(model: string | null = null): CodexThreadParams {
  return {
    cwd: DEFAULT_CODEX_CONFIG.CWD,
    model,
    modelProvider: null,
    approvalPolicy: DEFAULT_CODEX_CONFIG.APPROVAL_POLICY,
    sandbox: DEFAULT_CODEX_CONFIG.SANDBOX,
    config: null,
    baseInstructions: null,
    developerInstructions: null,
  };
}

export function createTurnParams(threadId: string, text: string, model: string | null = null): CodexTurnParams {
  return {
    threadId,
    input: [{ type: 'text', text }],
    cwd: null,
    approvalPolicy: null,
    sandboxPolicy: null,
    model,
    effort: null,
    summary: null,
  };
}

export function isAlertPayload(payload: any): boolean {
  return !!(payload?.source && payload?.title && payload?.subject);
}

export function generateConnectionId(): string {
  return `${Date.now()}`;
}

export function generateRequestId(): number {
  return Date.now();
}
