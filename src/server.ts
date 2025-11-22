// GENERATED CODE! DO NOT MODIFY BY HAND!

import Fastify from "fastify";
import cors from "@fastify/cors";
import websocket from "@fastify/websocket";
import { CodexProcess } from "./codex-process.js";

const server = Fastify({
    logger: true,
});

await server.register(cors, {
    origin: "*",
});

await server.register(websocket);

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
            server.log.error("Failed to start codex process", error);
            sendSafely({ error: "Failed to start codex process" });
            closeSafely();
            return;
        }

        // Forward messages from Codex to WebSocket
        codex.on("message", (message) => {
            sendSafely(message);
        });

        codex.on("exit", (code) => {
            sendSafely({ type: "process_exit", code });
            closeSafely();
        });

        codex.on("error", (error) => {
            server.log.error("Codex process error", error);
            sendSafely({ error: "Codex process error" });
            closeSafely();
        });

        // Forward messages from WebSocket to Codex
        socket.on("message", (message) => {
            try {
                const data = JSON.parse(message.toString());
                codex.send(data);
            } catch (error) {
                server.log.error("Failed to parse message from client", error);
            }
        });

        socket.on("close", () => {
            codex.stop();
        });

        socket.on("error", (error) => {
            server.log.error("WebSocket error", error);
            codex.stop();
            closeSafely();
        });
    } catch (error) {
        server.log.error("Failed to handle websocket connection", error);
        sendSafely({ error: "Failed to start codex process" });
        closeSafely();
    }
});

const start = async () => {
    try {
        await server.listen({ port: 3000, host: "0.0.0.0" });
    } catch (err) {
        server.log.error(err);
        process.exit(1);
    }
};

start();
