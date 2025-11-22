let ws = null;
let threadId = null;
let currentApprovalRequest = null;

function updateStatus(connected) {
    const statusDot = document.querySelector('.status-dot');
    const statusText = document.getElementById('status-text');
    const connectBtn = document.getElementById('connect-btn');
    const messageInput = document.getElementById('message-input');
    const sendBtn = document.getElementById('send-btn');

    if (connected) {
        statusDot.className = 'status-dot connected';
        statusText.textContent = 'Connected';
        connectBtn.textContent = 'Disconnect';
        connectBtn.className = 'btn btn-connect connected';
        messageInput.disabled = false;
        sendBtn.disabled = false;
    } else {
        statusDot.className = 'status-dot disconnected';
        statusText.textContent = 'Disconnected';
        connectBtn.textContent = 'Connect';
        connectBtn.className = 'btn btn-connect';
        messageInput.disabled = true;
        sendBtn.disabled = true;
    }
}

function addMessage(type, content) {
    const chatContainer = document.getElementById('chat-container');
    const welcomeMessage = chatContainer.querySelector('.welcome-message');
    if (welcomeMessage) {
        welcomeMessage.remove();
    }

    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${type}`;

    const avatar = document.createElement('div');
    avatar.className = 'message-avatar';
    avatar.textContent = type === 'user' ? '👤' : type === 'assistant' ? '🤖' : 'ℹ️';

    const content_div = document.createElement('div');
    content_div.className = 'message-content';
    content_div.textContent = content;

    messageDiv.appendChild(avatar);
    messageDiv.appendChild(content_div);
    chatContainer.appendChild(messageDiv);
    chatContainer.scrollTop = chatContainer.scrollHeight;
}

function showTypingIndicator() {
    const chatContainer = document.getElementById('chat-container');
    const typingDiv = document.createElement('div');
    typingDiv.className = 'message assistant';
    typingDiv.id = 'typing-indicator';

    const avatar = document.createElement('div');
    avatar.className = 'message-avatar';
    avatar.textContent = '🤖';

    const content = document.createElement('div');
    content.className = 'message-content typing-indicator';
    content.innerHTML = '<div class="typing-dot"></div><div class="typing-dot"></div><div class="typing-dot"></div>';

    typingDiv.appendChild(avatar);
    typingDiv.appendChild(content);
    chatContainer.appendChild(typingDiv);
    chatContainer.scrollTop = chatContainer.scrollHeight;
}

function hideTypingIndicator() {
    const typingIndicator = document.getElementById('typing-indicator');
    if (typingIndicator) {
        typingIndicator.remove();
    }
}

function showApprovalPanel(message) {
    const panel = document.getElementById('approval-panel');
    const messageEl = document.getElementById('approval-message');
    messageEl.textContent = message;
    panel.style.display = 'block';
}

function hideApprovalPanel() {
    const panel = document.getElementById('approval-panel');
    panel.style.display = 'none';
    currentApprovalRequest = null;
}

function handleApproval(decision) {
    if (!currentApprovalRequest || !ws) return;

    const response = {
        id: currentApprovalRequest.id,
        result: {
            decision: decision
        }
    };

    ws.send(JSON.stringify(response));
    addMessage('system', `Command ${decision === 'accept' ? 'approved' : 'declined'}`);
    hideApprovalPanel();
}

function toggleConnection() {
    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.close();
    } else {
        connect();
    }
}

function connect() {
    ws = new WebSocket('ws://localhost:3000/api/v1/sre/socket');

    ws.onopen = () => {
        updateStatus(true);
        addMessage('system', 'Connected to SRE Agent');

        // Send initialize message
        const initMessage = {
            method: "initialize",
            params: {
                clientInfo: {
                    name: "sre-agent-web",
                    version: "1.0.0",
                    title: "Web UI"
                }
            },
            id: 1
        };
        ws.send(JSON.stringify(initMessage));
    };

    ws.onmessage = (event) => {
        const response = JSON.parse(event.data);
        console.log('Received:', response);

        // Handle initialization response
        if (response.id === 1 && response.result) {
            addMessage('system', 'Initialized successfully');

            // Start a thread with approval policy enabled
            const threadStartMessage = {
                method: "thread/start",
                params: {
                    cwd: "/tmp",
                    model: null,
                    modelProvider: null,
                    approvalPolicy: "onRequest",     // Enable approval for all commands
                    sandbox: "workspaceWrite",       // Allow workspace write access
                    config: null,
                    baseInstructions: null,
                    developerInstructions: null
                },
                id: 2
            };
            ws.send(JSON.stringify(threadStartMessage));
        }

        // Handle thread start response
        if (response.id === 2 && response.result?.thread?.id) {
            threadId = response.result.thread.id;
            addMessage('system', `Thread started: ${threadId.substring(0, 8)}...`);
        }

        // Handle agent messages
        if (response.method === 'item/completed' && response.params?.item?.type === 'agentMessage') {
            hideTypingIndicator();
            const text = response.params.item.text;
            if (text && text.trim()) {
                addMessage('assistant', text);
            }
        }

        // Handle approval requests
        if (response.method === 'item/commandExecution/requestApproval') {
            const params = response.params;
            currentApprovalRequest = response;
            showApprovalPanel(`Command execution requires approval:\nCommand ID: ${params.itemId}\nThread: ${params.threadId}`);
        }

        // Handle turn completion
        if (response.method === 'turn/completed') {
            hideTypingIndicator();
            if (response.params?.turn?.status === 'failed') {
                const errorMsg = response.params.turn.error?.message || 'Unknown error';
                addMessage('system', `❌ Error: ${errorMsg}`);

                // Provide helpful hints for common errors
                if (errorMsg.includes('model output must contain either output text or tool calls')) {
                    addMessage('system', '💡 Tip: This error usually means the model is not compatible with tool calls. Try using ChatGPT login (npx @openai/codex login) or an OpenAI API key.');
                }
            }
        }

        // Handle general errors
        if (response.method === 'error' && response.params?.error) {
            hideTypingIndicator();
            addMessage('system', `❌ ${response.params.error.message}`);
        }
    };

    ws.onerror = (error) => {
        console.error('WebSocket error:', error);
        addMessage('system', 'Connection error');
    };

    ws.onclose = () => {
        updateStatus(false);
        addMessage('system', 'Disconnected from SRE Agent');
        threadId = null;
    };
}

function sendMessage() {
    const input = document.getElementById('message-input');
    const message = input.value.trim();

    if (!message || !ws || !threadId) return;

    addMessage('user', message);
    input.value = '';

    showTypingIndicator();

    const turnStartMessage = {
        method: "turn/start",
        params: {
            threadId: threadId,
            input: [
                {
                    type: "text",
                    text: message
                }
            ],
            cwd: null,
            approvalPolicy: null,
            sandboxPolicy: null,
            model: null,
            effort: null,
            summary: null
        },
        id: Date.now()
    };

    ws.send(JSON.stringify(turnStartMessage));
}

function handleKeyPress(event) {
    if (event.key === 'Enter') {
        sendMessage();
    }
}

// Auto-connect on page load
window.addEventListener('load', () => {
    // Don't auto-connect, let user click the button
});
