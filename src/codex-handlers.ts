import type { CodexProcess } from './codex-process.js';
import type { SSEConnection, PendingRequest } from './server-types.js';
import { constructAlertPrompt } from './prompt-utils.js';
import { REQUEST_IDS, createThreadParams, createTurnParams, generateRequestId } from './server-utils.js';
import { convertCodexMessageToSSE } from './codex-converter.js';

/**
 * 处理待处理的 alert 请求
 */
export function handlePendingAlertRequest(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  message: any,
  pendingRequests: Map<number, PendingRequest>,
  codex: CodexProcess,
): void {
  if (!message.id || !pendingRequests.has(message.id)) {
    return;
  }

  const req = pendingRequests.get(message.id);
  if (!req) return;

  if (req.type === 'init_alert' && message.result?.thread?.id) {
    pendingRequests.delete(message.id);
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
 * 创建 Codex 消息处理器
 */
export function createCodexMessageHandler(
  codex: CodexProcess,
  pendingRequests: Map<number, PendingRequest>,
  sseConnections: Map<string, SSEConnection>,
  connectionId: string,
  alertPrompt: string | null,
  initialUserInput: string | null,
  sendSafely: (chunk: string) => void,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  logger: any,
) {
  // 避免重复关闭
  let turnFinalized = false;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
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

    // 先把当前消息转换为 SSE 事件后发送（task_complete 等场景下仍需返回给前端）
    const sseEvents = convertCodexMessageToSSE(message);
    sseEvents.forEach((evt: string) => {
      // 直接打印原始 SSE 响应体
      console.log(evt.trim());
      sendSafely(evt);
    });

    // 延迟关闭，确保最后的消息已发送
    setTimeout(() => {
      const connection = sseConnections.get(connectionId);
      if (connection) {
        logger.info({ connectionId }, 'Closing SSE connection after turn completion');
        codex.stop();
        connection.close();
        if (connection.heartbeat) {
          clearInterval(connection.heartbeat);
        }
        sseConnections.delete(connectionId);
      }
    }, 100);

    return true;
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (message: any) => {
    // 处理待处理的请求
    handlePendingAlertRequest(message, pendingRequests, codex);

    // 处理初始化完成
    if (message.id === REQUEST_IDS.INIT && message.result) {
      codex.send({
        method: 'thread/start',
        params: createThreadParams(),
        id: REQUEST_IDS.THREAD_START,
      });
    }

    // 处理线程启动完成
    if (message.id === REQUEST_IDS.THREAD_START && message.result?.thread?.id) {
      const connection = sseConnections.get(connectionId);
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

    // 检测 turn 完成状态（通过 RPC 响应）
    if (maybeFinalizeTurn(message.result?.turn?.status, 'rpc_result', message)) {
      return;
    }

    // turn/completed 通知
    if (maybeFinalizeTurn(message.params?.turn?.status, 'notification', message)) {
      return;
    }

    // 明确的错误/中止事件也视为结束
    const msgType = message.params?.msg?.type;
    if (msgType === 'turn_aborted' || msgType === 'stream_error' || msgType === 'error') {
      if (maybeFinalizeTurn('failed', msgType, message)) {
        return;
      }
    }

    // 转换并发送 SSE 事件
    const sseEvents = convertCodexMessageToSSE(message);
    sseEvents.forEach((evt: string) => {
      // 直接打印原始 SSE 响应体
      console.log(`[${connectionId}] SSE event sent:`);
      console.log(evt.trim());
      sendSafely(evt);
    });
  };
}
