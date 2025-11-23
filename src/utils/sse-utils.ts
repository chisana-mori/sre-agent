import type { FastifyReply } from 'fastify';
import type { SSEConnection } from '../types/index.js';
import { SERVER_CONFIG } from '../config/constants.js';

/**
 * 初始化 SSE 响应头
 */
export function initializeSSEResponse(reply: FastifyReply): void {
  reply.hijack();
  reply.raw.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  reply.raw.flushHeaders?.();
}

/**
 * 创建安全的 SSE 发送函数
 */
export function createSafeSender(reply: FastifyReply) {
  return (chunk: string) => {
    if (!reply.raw.destroyed) {
      reply.raw.write(chunk);
    }
  };
}

/**
 * 创建安全的连接关闭函数
 */
export function createSafeCloser(reply: FastifyReply) {
  return () => {
    if (!reply.raw.destroyed) {
      reply.raw.end();
    }
  };
}

/**
 * 发送 SSE 事件
 */
export function sendSSEEvent(sendFn: (chunk: string) => void, event: string, data: any): void {
  sendFn(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

/**
 * 发送连接确认
 */
export function sendConnectionAck(sendFn: (chunk: string) => void, connectionId: string): void {
  sendSSEEvent(sendFn, 'connection_ack', { connectionId });
}

/**
 * 发送错误事件
 */
export function sendErrorEvent(sendFn: (chunk: string) => void, error: string): void {
  sendSSEEvent(sendFn, 'error', { error });
}

/**
 * 启动心跳
 */
export function startHeartbeat(
  sendFn: (chunk: string) => void,
  interval: number = SERVER_CONFIG.HEARTBEAT_INTERVAL,
): NodeJS.Timeout {
  return setInterval(() => {
    sendFn(':ping\n\n');
  }, interval);
}

/**
 * 清理 SSE 连接
 */
export function cleanupConnection(
  connection: SSEConnection | undefined,
  connections: Map<string, SSEConnection>,
  connectionId: string,
): void {
  if (connection?.heartbeat) {
    clearInterval(connection.heartbeat);
  }
  connections.delete(connectionId);
}
