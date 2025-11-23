import Fastify from 'fastify';
import cors from '@fastify/cors';
import fastifyStatic from '@fastify/static';
import path from 'path';
import { fileURLToPath } from 'url';
import { StreamController } from './controllers/stream-controller.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export async function buildApp() {
  const app = Fastify({
    logger: true,
    connectionTimeout: 0,
    requestTimeout: 0,
  });

  // Register plugins
  await app.register(cors, { origin: '*' });
  await app.register(fastifyStatic, {
    root: path.join(__dirname, '../public'),
    prefix: '/',
  });

  // Static file routes
  app.get('/', async (request, reply) => {
    return reply.sendFile('index-v2.html');
  });

  // Controllers
  const streamController = new StreamController(app.log);

  // API Routes
  app.route({
    method: ['GET', 'POST'],
    url: '/api/stream/investigate',
    handler: streamController.handleSseConnection,
  });

  app.post('/api/stream/investigate/send', streamController.handleSend);

  return app;
}
