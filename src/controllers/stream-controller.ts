import type { FastifyRequest, FastifyReply } from 'fastify';
import { CodexService } from '../services/codex-service.js';

export class StreamController {
  private codexService: CodexService;

  constructor(logger: any) {
    this.codexService = new CodexService(logger);
  }

  handleSseConnection = async (request: FastifyRequest, reply: FastifyReply) => {
    const body = (request.body as any) || {};
    const wantsSse = (request.headers?.accept || '').includes('text/event-stream');
    const connectionId = body.connectionId || `${Date.now()}`;

    request.log.info({ connectionId, hasPayload: !!body }, 'Received SSE request');

    if (!wantsSse) {
      return reply.code(400).send({
        error: 'This endpoint only supports Server-Sent Events (SSE). Please set Accept header to "text/event-stream".',
      });
    }

    await this.codexService.startSession(connectionId, reply, body);
    return reply.raw;
  };

  handleSend = async (request: FastifyRequest, reply: FastifyReply) => {
    const body = (request.body as any) || {};
    const { connectionId, ...rest } = body;

    if (!connectionId) {
      return reply.code(400).send({ error: 'Invalid or missing connectionId' });
    }

    try {
      // Forward the rest of the body exactly as received (excluding connectionId)
      // Expected format: { id: 0, result: { decision: "accept" } }
      this.codexService.sendApproval(connectionId, rest);
    } catch (error) {
      request.log.error({ err: error }, 'Failed to forward payload to Codex');
      return reply.code(500).send({ error: 'Failed to forward payload to Codex' });
    }

    return reply.send({ ok: true });
  };
}
