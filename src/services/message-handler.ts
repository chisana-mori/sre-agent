import type { CodexProcess } from './codex-process.js';
import { constructAlertPrompt } from '../utils/prompt-builder.js';
import { REQUEST_IDS } from '../config/constants.js';
import { createThreadParams, createTurnParams, generateRequestId } from '../utils/common-utils.js';
import { connectionManager } from './connection-manager.js';
import { convertCodexMessageToSSE } from './codex-converter.js';

/**
 * Handle pending alert requests
 */
export function handlePendingAlertRequest(message: any, codex: CodexProcess): void {
  if (!message.id) return;

  const req = connectionManager.getPendingRequest(message.id);
  if (!req) return;

  if (req.type === 'init_alert' && message.result?.thread?.id) {
    connectionManager.removePendingRequest(message.id);
    const threadId = message.result.thread.id;
    const prompt = constructAlertPrompt(req.payload);

    codex.send({
      method: 'turn/start',
      id: generateRequestId(),
      params: createTurnParams(threadId, prompt, req.payload.model || null),
    });
  }
}

/**
 * Create Codex message handler
 */
export function createCodexMessageHandler(
  codex: CodexProcess,
  connectionId: string,
  alertPrompt: string | null,
  initialUserInput: string | null,
  sendSafely: (chunk: string) => void,
  logger: any,
) {
  // Avoid duplicate closing
  let turnFinalized = false;

  const maybeFinalizeTurn = (turnStatus: string | undefined, source: string, message: any) => {
    if (turnFinalized) {
      return true;
    }
    if (!turnStatus || !['completed', 'failed', 'interrupted'].includes(turnStatus)) {
      return false;
    }

    turnFinalized = true;

    logger.info(
      {
        connectionId,
        turnStatus,
        source,
      },
      'Turn finished, closing connection',
    );

    // Convert current message to SSE events and send
    const sseEvents = convertCodexMessageToSSE(message);
    sseEvents.forEach((evt: string) => {
      // console.log(`[${connectionId}] SSE event sent:`);
      // console.log(evt.trim());
      sendSafely(evt);
    });

    // Delay closing to ensure last message is sent
    setTimeout(() => {
      const connection = connectionManager.getConnection(connectionId);
      if (connection) {
        logger.info({ connectionId }, 'Closing SSE connection after turn completion');
        codex.stop();
        connection.close();
        connectionManager.removeConnection(connectionId);
      }
    }, 100);

    return true;
  };

  return (message: any) => {
    // Handle pending requests
    handlePendingAlertRequest(message, codex);

    // Handle initialization complete
    if (message.id === REQUEST_IDS.INIT && message.result) {
      codex.send({
        method: 'thread/start',
        params: createThreadParams(),
        id: REQUEST_IDS.THREAD_START,
      });
    }

    // Handle thread start complete
    if (message.id === REQUEST_IDS.THREAD_START && message.result?.thread?.id) {
      const connection = connectionManager.getConnection(connectionId);
      if (connection) {
        connection.threadId = message.result.thread.id;
      }

      const text = alertPrompt || (initialUserInput ? String(initialUserInput) : null);
      if (text && connection?.threadId) {
        codex.send({
          method: 'turn/start',
          id: generateRequestId(),
          params: createTurnParams(connection.threadId, text),
        });
      }
    }

    // Check turn completion status (via RPC response)
    if (maybeFinalizeTurn(message.result?.turn?.status, 'rpc_result', message)) {
      return;
    }

    // turn/completed notification
    if (maybeFinalizeTurn(message.params?.turn?.status, 'notification', message)) {
      return;
    }

    // Explicit error/abort events
    const msgType = message.params?.msg?.type;
    if (msgType === 'turn_aborted' || msgType === 'stream_error' || msgType === 'error') {
      if (maybeFinalizeTurn('failed', msgType, message)) {
        return;
      }
    }

    // Convert and send SSE events
    const sseEvents = convertCodexMessageToSSE(message);
    sseEvents.forEach((evt: string) => {
      // console.log(`[${connectionId}] SSE event sent:`);
      // console.log(evt.trim());
      sendSafely(evt);
    });
  };
}
