import type { FastifyReply } from 'fastify';
import { CodexProcess } from './codex-process.js';
import { connectionManager } from './connection-manager.js';
import { createCodexMessageHandler } from './message-handler.js';
import {
  initializeSSEResponse,
  createSafeSender,
  createSafeCloser,
  sendConnectionAck,
  sendErrorEvent,
  startHeartbeat,
  cleanupConnection,
} from '../utils/sse-utils.js'; // We need to move sse-utils to utils
import { REQUEST_IDS } from '../config/constants.js';
import { createInitParams, createThreadParams, generateRequestId, isAlertPayload } from '../utils/common-utils.js';
import { constructAlertPrompt } from '../utils/prompt-builder.js';

export class CodexService {
  constructor(private logger: any) {}

  async startSession(connectionId: string, reply: FastifyReply, payload: any) {
    const wantsSse = (payload?.headers?.accept || '').includes('text/event-stream'); // Note: payload here is request body, headers passed separately?
    // Actually controller passes request/reply.

    // Initialize SSE
    initializeSSEResponse(reply);
    const sendSafely = createSafeSender(reply);
    const closeSafely = createSafeCloser(reply);

    try {
      const codex = new CodexProcess();
      try {
        codex.start(process.env);
      } catch (error) {
        this.logger.error({ err: error }, 'Failed to start codex process');
        sendErrorEvent(sendSafely, 'Failed to start codex process');
        closeSafely();
        return;
      }

      // Register connection
      connectionManager.addConnection(connectionId, {
        codex,
        sendChunk: sendSafely,
        close: closeSafely,
        threadId: undefined,
        heartbeat: undefined,
      });

      // Start heartbeat
      const heartbeat = startHeartbeat(sendSafely);
      const conn = connectionManager.getConnection(connectionId);
      if (conn) conn.heartbeat = heartbeat;

      // Send Ack
      sendConnectionAck(sendSafely, connectionId);

      // Prepare prompt
      const alertPrompt = isAlertPayload(payload) ? constructAlertPrompt(payload) : null;
      const initialUserInput = payload?.input || payload?.message || payload?.text || null;

      // Setup Message Handler
      const messageHandler = createCodexMessageHandler(
        codex,
        connectionId,
        alertPrompt,
        initialUserInput,
        sendSafely,
        this.logger,
      );
      codex.on('message', messageHandler);

      // Send Init
      codex.send({
        method: 'initialize',
        params: createInitParams(),
        id: REQUEST_IDS.INIT,
      });

      // Handle Exit
      codex.on('exit', (info: { code: number | null; signal: NodeJS.Signals | null }) => {
        const { code, signal } = info || {};
        this.logger.error({ connectionId, code, signal }, 'Codex process exited');
        sendErrorEvent(
          sendSafely,
          `Codex process exited (code ${code ?? 'unknown'}${signal ? `, signal ${signal}` : ''})`,
        );
        sendSafely(`event: process_exit\ndata: ${JSON.stringify({ code, signal })}\n\n`);
        closeSafely();
        connectionManager.removeConnection(connectionId);
      });

      // Handle Error
      codex.on('error', (error: any) => {
        this.logger.error({ err: error, connectionId }, 'Codex process error');
        sendErrorEvent(sendSafely, `Codex process error: ${error instanceof Error ? error.message : String(error)}`);
        closeSafely();
        connectionManager.removeConnection(connectionId);
      });

      // Handle Client Disconnect
      reply.raw.on('close', () => {
        this.logger.warn(
          {
            connectionId,
            writableEnded: reply.raw.writableEnded,
            writableFinished: reply.raw.writableFinished,
            destroyed: reply.raw.destroyed,
          },
          'Client closed SSE connection',
        );
        codex.stop();
        connectionManager.removeConnection(connectionId);
      });
    } catch (error) {
      this.logger.error({ err: error, connectionId }, 'Failed to handle SSE connection');
      sendErrorEvent(sendSafely, 'Failed to start codex process');
      closeSafely();
    }
  }

  forwardPayload(connectionId: string, payload: any) {
    const connection = connectionManager.getConnection(connectionId);
    if (!connection) {
      throw new Error('Connection not found');
    }

    if (isAlertPayload(payload)) {
      const reqId = connectionManager.addPendingRequest('init_alert', payload);

      connection.codex.send({
        method: 'thread/start',
        id: reqId,
        params: createThreadParams(payload.model || null),
      });
      return;
    }

    connection.codex.send(payload);
  }
}
