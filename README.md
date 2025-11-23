# SRE Agent Server

A Server-Sent Events (SSE) based server that wraps the OpenAI Codex agent, exposing it via a streaming interface. This server acts as a bridge between a client (e.g., a web browser) and the `codex app-server`, enabling real-time streaming of agent responses and tool executions.

## Features

- **SSE Interface**: Exposes a streaming endpoint (`/api/stream/investigate`) for real-time updates.
- **Codex App Server**: Wraps the official `codex` binary running in `app-server` mode.
- **Modular Architecture**: Clean separation of concerns with Services, Controllers, and Utils.
- **Bun Runtime**: Optimized for the Bun runtime for fast startup and execution.
- **Secure Configuration**: Uses `.env` for sensitive configuration.

## Prerequisites

- [Bun](https://bun.sh/) (v1.0+)
- Node.js (required by `@openai/codex` post-install scripts)

## Installation

1.  **Clone the repository**:

    ```bash
    git clone <repository-url>
    cd sre-agent
    ```

2.  **Install dependencies**:

    ```bash
    bun install
    ```

3.  **Configure Authentication**:

    The server uses the `codex` binary's default authentication mechanism. You have two options:

    **Option 1: ChatGPT Login (Recommended)**
    - Run `npx @openai/codex login` to authenticate with your ChatGPT account
    - The codex binary will use your existing ChatGPT session

    **Option 2: API Key**
    - Set the `OPENAI_API_KEY` environment variable in your shell:
      ```bash
      export OPENAI_API_KEY=your-api-key-here
      ```
    - The codex binary will automatically use this key

## Usage

### Starting the Server

Run the server in development mode (with hot reload):

```bash
bun run dev
```

Or start it for production:

```bash
bun start
```

The server will listen on `http://0.0.0.0:8081`.

### API Endpoints

#### 1. Connect to Event Stream

**GET/POST** `/api/stream/investigate`

Establishes a Server-Sent Events (SSE) connection.

**Headers:**

- `Accept: text/event-stream`

**Body (Optional):**

```json
{
  "connectionId": "optional-custom-id",
  "payload": {
    "source": "alert",
    "title": "High CPU Usage",
    "subject": { ... },
    "context": { ... }
  }
}
```

If an alert payload is provided in the initial connection request, the server will automatically initialize a thread and start processing the alert.

#### 2. Send Message

**POST** `/api/stream/investigate/send`

Sends a message or payload to an active connection.

**Body:**

```json
{
  "connectionId": "required-connection-id",
  "payload": {
    "text": "Check the logs for pod-123"
  }
}
```

### Project Structure

The project follows a modular layered architecture:

- **`src/app.ts`**: Application factory and configuration.
- **`src/server.ts`**: Entry point that starts the server.
- **`src/config/`**: Configuration constants.
- **`src/controllers/`**: Request handlers (e.g., `StreamController`).
- **`src/services/`**: Business logic and state management.
  - `codex-service.ts`: Manages Codex process lifecycle.
  - `connection-manager.ts`: Manages active SSE connections.
  - `message-handler.ts`: Handles messages between Codex and Client.
- **`src/utils/`**: Shared utility functions.
- **`src/types/`**: TypeScript type definitions.

### Sandbox Mode

The agent runs with `workspaceWrite` sandbox mode:

- Can read and write files in the workspace
- Cannot access network resources (unless configured otherwise)
- Provides a balance between functionality and security

## License

ISC
