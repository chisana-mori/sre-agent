# SRE Agent Server

A WebSocket-based server that wraps the OpenAI Codex agent, exposing it via a JSON-RPC interface. This server acts as a bridge between a client (e.g., a web browser) and the `codex app-server`, enabling bidirectional communication, real-time streaming, and interactive approval flows.

## Features

- **WebSocket Interface**: Exposes a WebSocket endpoint (`/api/v1/sre/socket`) for persistent, bidirectional communication.
- **Codex App Server**: Wraps the official `codex` binary running in `app-server` mode.
- **JSON-RPC Protocol**: Fully supports the Codex App Server JSON-RPC protocol for messages, notifications, and approvals.
- **Bun Runtime**: Optimized for the Bun runtime for fast startup and execution.
- **Secure Configuration**: Uses `.env` for sensitive configuration like API keys.

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

### Web UI

The easiest way to interact with the SRE Agent is through the web interface:

1. Start the server:
   ```bash
   bun run dev
   ```

2. Open your browser and navigate to:
   ```
   http://localhost:3000
   ```

3. Click "Connect" to establish a WebSocket connection
4. Start chatting with the agent!

**Features:**
- 💬 Real-time chat interface
- ✅ Interactive approval prompts for command execution
- 🎨 Modern, responsive design
- 📱 Works on desktop and mobile browsers

**Approval Policy:**

The agent runs with `approvalPolicy: "onRequest"` which means:
- All command executions require your approval
- You'll see a prompt in the UI before any command runs
- Click "Approve" to allow the command or "Decline" to reject it
- This ensures you have full control over what the agent does

**Sandbox Mode:**

The agent runs with `workspaceWrite` sandbox mode:
- Can read and write files in the workspace
- Cannot access network resources
- Provides a balance between functionality and security

**Server-Side Configuration:**

The SRE Agent server (`src/codex-process.ts`) starts the codex binary with default configuration:
```typescript
'-c', 'approval_policy="on-request"'      // CLI format uses kebab-case
'-c', 'sandbox_permissions=["workspace-write"]'
```

**Important:** The command-line configuration (`-c`) uses **kebab-case** (e.g., `on-request`), while the JSON-RPC API uses **camelCase** (e.g., `onRequest`).

**Valid `approvalPolicy` values for JSON-RPC:**
- `"unlessTrusted"` - Request approval unless the command is trusted
- `"onFailure"` - Request approval when a command fails
- `"onRequest"` - Request approval for every command (most secure)
- `"never"` - Never request approval


### Starting the Server

Run the server in development mode (with hot reload):
```bash
bun run dev
```

Or start it for production:
```bash
bun start
```

The server will listen on `http://0.0.0.0:3000`.

### Connecting via WebSocket

Connect to the WebSocket endpoint:
```
ws://localhost:3000/api/v1/sre/socket
```

Once connected, you can send JSON-RPC messages to the agent. The server will forward these to the `codex app-server` and stream responses back to you.

#### Example: Complete Flow

The Codex App Server uses a v2 API that requires the following flow:

**1. Initialize the session:**
```json
{
  "method": "initialize",
  "params": {
    "clientInfo": {
      "name": "your-client-name",
      "version": "1.0.0",
      "title": "optional-title"
    }
  },
  "id": 1
}
```

**2. Start a thread (conversation):**
```json
{
  "method": "thread/start",
  "params": {
    "cwd": "/path/to/working/directory",
    "model": null,
    "modelProvider": null,
    "approvalPolicy": null,
    "sandbox": null,
    "config": null,
    "baseInstructions": null,
    "developerInstructions": null
  },
  "id": 2
}
```

The server will respond with a `threadId`.

**3. Start a turn with user input:**
```json
{
  "method": "turn/start",
  "params": {
    "threadId": "<threadId-from-step-2>",
    "input": [
      {
        "type": "text",
        "text": "Check disk usage on localhost"
      }
    ],
    "cwd": null,
    "approvalPolicy": null,
    "sandboxPolicy": null,
    "model": null,
    "effort": null,
    "summary": null
  },
  "id": 3
}
```

The agent will then process your request and stream responses back via notifications.

### Testing via CLI

**Using wscat (Recommended):**
```bash
npx wscat -c ws://localhost:3000/api/v1/sre/socket
```

**Using curl (Connection Check Only):**
Since this is a WebSocket server, `curl` cannot be used to send messages, but you can verify the handshake:
```bash
curl -i -N \
  -H "Connection: Upgrade" \
  -H "Upgrade: websocket" \
  -H "Host: localhost:3000" \
  -H "Origin: http://localhost:3000" \
  -H "Sec-WebSocket-Key: SGVsbG8sIHdvcmxkIQ==" \
  -H "Sec-WebSocket-Version: 13" \
  http://localhost:3000/api/v1/sre/socket
```
Expected output includes `HTTP/1.1 101 Switching Protocols`.

### Approval Flow

When the agent needs to execute a command or apply a patch, it may send an approval request to the client:

**Server Request (via WebSocket):**
```json
{
  "method": "execCommandApproval",
  "params": {
    "conversation_id": "unique-id",
    "call_id": "call-123",
    "command": "df -h",
    "cwd": "/path/to/cwd"
  }
}
```

**Client Response:**
You must reply with a decision:
```json
{
  "id": null, 
  "result": {
    "decision": "allow" 
  }
}
```
*(Note: Check the exact JSON-RPC ID correlation required by the protocol)*

## Project Structure

- `src/server.ts`: Main Fastify server with WebSocket support.
- `src/codex-process.ts`: Manages the `codex app-server` child process and stdio piping.
- `src/codex-types/`: Generated TypeScript definitions for the Codex protocol.

## License

ISC
