// GENERATED CODE! DO NOT MODIFY BY HAND!

import Fastify from "fastify";
import cors from "@fastify/cors";
import websocket from "@fastify/websocket";
import fastifyStatic from "@fastify/static";
import { CodexProcess } from "./codex-process.js";
import { convertCodexMessageToSSE } from "./codex-converter.js";
import { constructAlertPrompt } from "./prompt-utils.js";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const pendingRequests = new Map<number, any>();

const server = Fastify({
    logger: true,
});

await server.register(cors, {
    origin: "*",
});

await server.register(websocket);

// Serve static files from public directory
await server.register(fastifyStatic, {
    root: path.join(__dirname, "../public"),
    prefix: "/",
});

// Serve the new modern UI as default
server.get("/", async (request, reply) => {
    return reply.sendFile("index-v2.html");
});

server.get("/api/v1/sre/socket", { websocket: true }, (socket, req) => {
    const sendSafely = (payload: unknown) => {
        if (socket.readyState === 1) {
            // 1 = OPEN
            socket.send(JSON.stringify(payload));
        }
    };

    const closeSafely = () => {
        if (socket.readyState === 1 || socket.readyState === 0) {
            // OPEN or CONNECTING
            socket.close();
        }
    };

    try {
        const codex = new CodexProcess();

        // Start codex process with current environment
        try {
            codex.start(process.env);
        } catch (error) {
            server.log.error({ err: error }, "Failed to start codex process");
            sendSafely({ error: "Failed to start codex process" });
            closeSafely();
            return;
        }

        // Forward messages from Codex to WebSocket
        codex.on("message", (message) => {
            // Handle internal pending requests
            if (message.id && pendingRequests.has(message.id)) {
                const req = pendingRequests.get(message.id);

                if (req.type === 'init_alert' && message.result?.thread?.id) {
                    pendingRequests.delete(message.id);
                    const threadId = message.result.thread.id;
                    const prompt = constructAlertPrompt(req.payload);

                    // Start the turn with the constructed prompt
                    codex.send({
                        method: 'turn/start',
                        id: Date.now(), // Simple ID generation
                        params: {
                            threadId: threadId,
                            input: [{ type: 'text', text: prompt }],
                            cwd: null,
                            approvalPolicy: null,
                            sandboxPolicy: null,
                            model: req.payload.model || null,
                            effort: null,
                            summary: null
                        }
                    });
                }
            }

            const sseEvents = convertCodexMessageToSSE(message);
            sseEvents.forEach((evt) => {
                if (socket.readyState === 1) {
                    socket.send(evt);
                }
            });
        });

        codex.on("exit", (code) => {
            sendSafely({ type: "process_exit", code });
            closeSafely();
        });

        codex.on("error", (error) => {
            server.log.error({ err: error }, "Codex process error");
            sendSafely({ error: "Codex process error" });
            closeSafely();
        });

        // Forward messages from WebSocket to Codex
        socket.on("message", (message) => {
            try {
                const data = JSON.parse(message.toString());

                // Check for special Alert payload (heuristic: has source, title, subject)
                if (data.source && data.title && data.subject) {
                    const reqId = Date.now();
                    pendingRequests.set(reqId, { type: 'init_alert', payload: data });

                    // Start a new thread for this alert
                    codex.send({
                        method: 'thread/start',
                        id: reqId,
                        params: {
                            cwd: "/tmp",
                            model: data.model || null,
                            modelProvider: null,
                            approvalPolicy: "onRequest",
                            sandbox: "dangerFullAccess",
                            config: null,
                            baseInstructions: null,
                            developerInstructions: null
                        }
                    });
                    return;
                }

                codex.send(data);
            } catch (error) {
                server.log.error({ err: error }, "Failed to parse message from client");
            }
        });

        socket.on("close", () => {
            codex.stop();
        });

        socket.on("error", (error) => {
            server.log.error({ err: error }, "WebSocket error");
            codex.stop();
            closeSafely();
        });
    } catch (error) {
        server.log.error({ err: error }, "Failed to handle websocket connection");
        sendSafely({ error: "Failed to start codex process" });
        closeSafely();
    }
});

const start = async () => {
    try {
        await server.listen({ port: 8081, host: "0.0.0.0" });
    } catch (err) {
        server.log.error(err);
        process.exit(1);
    }
};

start();
