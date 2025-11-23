import { buildApp } from './app.js';
import { SERVER_CONFIG } from './config/constants.js';

async function start() {
  try {
    const app = await buildApp();
    await app.listen({ port: SERVER_CONFIG.PORT, host: SERVER_CONFIG.HOST });
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

start();
