let ws = null;
let threadId = null;
let currentApprovalRequest = null;

// Configure marked
if (typeof marked !== 'undefined') {
    marked.setOptions({
        highlight: function (code, lang) {
            return code;
        },
        breaks: true,
        gfm: true
    });
}

// --- UI Component Renderers ---

function renderMarkdown(content) {
    if (typeof marked !== 'undefined' && typeof DOMPurify !== 'undefined') {
        const html = marked.parse(content);
        return `<div class="message-content prose prose-invert max-w-none">${DOMPurify.sanitize(html)}</div>`;
    }
    return `<div class="message-content whitespace-pre-wrap">${content}</div>`;
}

function renderAccordion(title, content) {
    const id = 'acc-' + Math.random().toString(36).substr(2, 9);
    // If content is an object, stringify it
    const contentStr = typeof content === 'object' ? JSON.stringify(content, null, 2) : content;
    const safeContent = contentStr.replace(/</g, '&lt;').replace(/>/g, '&gt;');

    return `
        <div class="border border-gray-700 rounded-lg overflow-hidden mb-2">
            <div class="accordion-header bg-gray-800 px-4 py-2 flex items-center justify-between hover:bg-gray-750 transition-colors" onclick="toggleAccordion('${id}')">
                <span class="text-sm font-medium text-gray-300 truncate">${title}</span>
                <svg id="icon-${id}" class="w-4 h-4 text-gray-400 transform transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path>
                </svg>
            </div>
            <div id="${id}" class="accordion-content bg-gray-900">
                <div class="p-4 text-xs font-mono text-gray-400 whitespace-pre-wrap overflow-x-auto">${safeContent}</div>
            </div>
        </div>
    `;
}

function toggleAccordion(id) {
    const content = document.getElementById(id);
    const icon = document.getElementById(`icon-${id}`);
    if (content && icon) {
        if (content.classList.contains('open')) {
            content.classList.remove('open');
            icon.style.transform = 'rotate(0deg)';
        } else {
            content.classList.add('open');
            icon.style.transform = 'rotate(180deg)';
        }
    }
}
// Expose to global scope
window.toggleAccordion = toggleAccordion;

function renderDiff(diffContent) {
    const id = 'diff-' + Math.random().toString(36).substr(2, 9);
    // We need to render this after insertion, so we return a placeholder and a callback
    const html = `<div id="${id}" class="diff-container my-2"></div>`;

    const callback = () => {
        const target = document.getElementById(id);
        if (target && typeof Diff2HtmlUI !== 'undefined') {
            const diff2htmlUi = new Diff2HtmlUI(target, diffContent, {
                drawFileList: false,
                matching: 'lines',
                outputFormat: 'line-by-line',
                colorScheme: 'dark'
            });
            diff2htmlUi.draw();
        }
    };

    return { html, callback };
}

function renderApprovalRequest(event) {
    const params = event.params;
    const id = params.itemId;
    const command = params.command || 'Unknown command'; // Assuming command is in params, if not we might need to look elsewhere

    // Store for handling
    currentApprovalRequest = event;

    return `
        <div class="bg-yellow-900/20 border border-yellow-500/30 rounded-xl p-4 my-2">
            <div class="flex items-start space-x-3">
                <div class="flex-shrink-0 mt-1">
                    <svg class="w-5 h-5 text-yellow-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path>
                    </svg>
                </div>
                <div class="flex-1">
                    <h3 class="text-sm font-semibold text-yellow-500 mb-1">Approval Request</h3>
                    <div class="text-sm text-gray-300 font-mono bg-black/30 p-2 rounded mb-3">${command}</div>
                    <div class="flex space-x-2">
                        <button onclick="handleApproval('accept')" class="bg-green-600 hover:bg-green-700 text-white px-3 py-1.5 rounded text-sm font-medium transition-colors">
                            Approve
                        </button>
                        <button onclick="handleApproval('decline')" class="bg-red-600 hover:bg-red-700 text-white px-3 py-1.5 rounded text-sm font-medium transition-colors">
                            Deny
                        </button>
                    </div>
                </div>
            </div>
        </div>
    `;
}

function renderPlan(plan) {
    if (!Array.isArray(plan)) return '';

    const stepsHtml = plan.map((step, index) => `
        <div class="plan-step pb-4">
            <div class="plan-step-dot flex items-center justify-center">
                ${step.status === 'completed' ? '<div class="w-2 h-2 bg-white rounded-full"></div>' : ''}
            </div>
            <div class="text-sm ${step.status === 'completed' ? 'text-gray-400 line-through' : step.status === 'active' ? 'text-indigo-400 font-medium' : 'text-gray-500'}">
                ${step.description || step.title || 'Step ' + (index + 1)}
            </div>
        </div>
    `).join('');

    return `<div class="pl-2 py-2">${stepsHtml}</div>`;
}

// --- Event Handling ---

function normalizeEvent(response) {
    // Map JSON-RPC messages to codexia-style events

    // Handle Codexia-style events if they come through directly
    if (response.method && response.method.startsWith('codex/event/')) {
        if (response.params && response.params.msg) {
            const msg = response.params.msg;
            // Ensure type is present
            return { ...msg, type: msg.type || 'unknown_codex_event', conversationId: response.params.conversationId };
        }
    }

    if (response.method === 'item/completed') {
        if (response.params?.item?.type === 'agentMessage') {
            return { type: 'agent_message', message: response.params.item.text };
        }
        // Can add other item types here if we discover them
    }

    if (response.method === 'item/commandExecution/requestApproval') {
        return { type: 'exec_approval_request', params: response.params, id: response.id };
    }

    if (response.method === 'turn/completed') {
        if (response.params?.turn?.status === 'failed') {
            return { type: 'error', message: response.params.turn.error?.message || 'Turn failed' };
        }
        return { type: 'task_complete', duration: response.params?.turn?.durationMs }; // Hypothetical
    }

    if (response.method === 'error') {
        return { type: 'error', message: response.params?.error?.message || 'Unknown error' };
    }

    // Pass through unknown messages as 'unknown' type for debug rendering
    return { type: 'unknown', original: response };
}

function appendMessageElement(html, type, callback) {
    const chatContainer = document.getElementById('chat-container');
    const welcome = document.getElementById('welcome');
    if (welcome) welcome.remove();

    const messageDiv = document.createElement('div');
    messageDiv.className = `flex ${type === 'user' ? 'justify-end' : 'justify-start'} animate-fade-in mb-4`;

    const bubble = document.createElement('div');
    bubble.className = `max-w-3xl w-full ${type === 'user' ? 'bg-gradient-to-r from-indigo-600 to-purple-600 text-white' : 'bg-gray-800 border border-gray-700'} rounded-2xl px-4 py-3 shadow-lg overflow-hidden`;

    if (type === 'user') {
        bubble.classList.remove('w-full'); // User messages shouldn't be full width if short
        bubble.classList.add('w-auto');
    }

    bubble.innerHTML = html;
    messageDiv.appendChild(bubble);
    chatContainer.appendChild(messageDiv);
    chatContainer.scrollTop = chatContainer.scrollHeight;

    if (callback) callback();
}

function handleEvent(response) {
    const event = normalizeEvent(response);
    console.log('Normalized Event:', event);

    // Special handling for user messages (not from server usually, but for consistency)
    if (event.type === 'user_message') {
        appendMessageElement(event.message, 'user');
        return;
    }

    switch (event.type) {
        case 'agent_message':
            appendMessageElement(renderMarkdown(event.message), 'assistant');
            break;

        case 'exec_approval_request':
            // We render this as a special assistant message
            appendMessageElement(renderApprovalRequest(event), 'assistant');
            // Also show the global panel if needed, or just rely on the inline card
            // showApprovalPanel(...) // Optional: keep the sticky panel if desired
            break;

        case 'agent_reasoning':
            appendMessageElement(renderAccordion('Reasoning', event.text), 'assistant');
            break;

        case 'turn_diff':
            const { html, callback } = renderDiff(event.unified_diff);
            appendMessageElement(html, 'assistant', callback);
            break;

        case 'plan_update':
            appendMessageElement(renderAccordion('Plan Update', renderPlan(event.plan)), 'assistant');
            break;

        case 'task_complete':
            // Maybe just a small status update
            // appendMessageElement('<div class="text-xs text-green-400">Task Completed</div>', 'system');
            break;

        case 'error':
            appendMessageElement(`<div class="text-red-400 font-medium">Error: ${event.message}</div>`, 'system');
            break;

        case 'unknown':
            // For debugging, render unknown messages in an accordion
            // Only if it's not a boring message
            if (event.original.method !== 'item/started' && event.original.method !== 'item/completed') {
                appendMessageElement(renderAccordion(`Debug: ${event.original.method}`, event.original), 'system');
            }
            break;
    }
}

// --- Connection & Logic ---

function updateStatus(connected) {
    const statusDot = document.getElementById('status-dot');
    const statusText = document.getElementById('status-text');
    const connectBtn = document.getElementById('connect-btn');
    const messageInput = document.getElementById('message-input');
    const sendBtn = document.getElementById('send-btn');

    if (connected) {
        statusDot.className = 'w-2 h-2 rounded-full bg-green-500 animate-pulse';
        statusText.textContent = 'Connected';
        connectBtn.textContent = 'Disconnect';
        connectBtn.className = 'bg-red-500/20 hover:bg-red-500/30 backdrop-blur-sm text-white px-6 py-2 rounded-full font-medium transition-all duration-200 hover:scale-105';
        messageInput.disabled = false;
        sendBtn.disabled = false;
    } else {
        statusDot.className = 'w-2 h-2 rounded-full bg-red-500';
        statusText.textContent = 'Disconnected';
        connectBtn.textContent = 'Connect';
        connectBtn.className = 'bg-white/20 hover:bg-white/30 backdrop-blur-sm text-white px-6 py-2 rounded-full font-medium transition-all duration-200 hover:scale-105';
        messageInput.disabled = true;
        sendBtn.disabled = true;
    }
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
        appendMessageElement('<div class="text-green-400">✓ Connected to SRE Agent</div>', 'system');

        const initMessage = {
            method: "initialize",
            params: {
                clientInfo: {
                    name: "sre-agent-web-v2",
                    version: "2.0.0",
                    title: "Modern Web UI"
                }
            },
            id: 1
        };
        ws.send(JSON.stringify(initMessage));
    };

    ws.onmessage = (event) => {
        // Parse SSE format
        const text = event.data;
        const lines = text.split('\n');
        let eventType = null;
        let data = null;

        for (const line of lines) {
            if (line.startsWith('event: ')) {
                eventType = line.substring(7).trim();
            } else if (line.startsWith('data: ')) {
                try {
                    data = JSON.parse(line.substring(6));
                } catch (e) {
                    console.error('Failed to parse SSE data', e);
                }
            }
        }

        if (!eventType || !data) return;

        // Handle initialization flow explicitly
        if (eventType === 'rpc_result') {
            const response = data;
            if (response.id === 1 && response.result) {
                appendMessageElement('<div class="text-green-400">✓ Session initialized</div>', 'system');
                const threadStartMessage = {
                    method: "thread/start",
                    params: {
                        cwd: "/tmp",
                        model: null,
                        modelProvider: null,
                        approvalPolicy: "onRequest",
                        sandbox: "dangerFullAccess",
                        config: null,
                        baseInstructions: null,
                        developerInstructions: null
                    },
                    id: 2
                };
                ws.send(JSON.stringify(threadStartMessage));
                return;
            }

            if (response.id === 2 && response.result?.thread?.id) {
                threadId = response.result.thread.id;
                appendMessageElement(`<div class="text-green-400">✓ Thread started (${threadId.substring(0, 8)}...)</div>`, 'system');
                return;
            }
        }

        hideTypingIndicator();

        // Map new SSE events to internal format for handleEvent
        let internalEvent = null;
        switch (eventType) {
            case 'ai_message':
                if (data.is_reasoning) {
                    internalEvent = { type: 'agent_reasoning', text: data.content };
                } else {
                    internalEvent = { type: 'agent_message', message: data.content };
                }
                break;
            case 'approval_required':
                internalEvent = {
                    type: 'exec_approval_request',
                    params: { command: data.description, itemId: data.tool_call_id },
                    id: data.tool_call_id
                };
                break;
            case 'tool_calling_result':
                // Optional: display tool output if needed, or ignore
                break;
            case 'ai_answer_end':
                internalEvent = { type: 'task_complete' };
                break;
            case 'error':
                internalEvent = { type: 'error', message: data.error };
                break;
            default:
                console.log('Unhandled SSE event:', eventType, data);
        }

        if (internalEvent) {
            handleEvent(internalEvent);
        }
    };

    ws.onerror = (error) => {
        console.error('WebSocket error:', error);
        appendMessageElement('<div class="text-red-400">❌ Connection error</div>', 'system');
    };

    ws.onclose = () => {
        updateStatus(false);
        appendMessageElement('<div class="text-gray-400">✗ Disconnected</div>', 'system');
        threadId = null;
    };
}

function sendMessage() {
    const input = document.getElementById('message-input');
    const message = input.value.trim();

    if (!message || !ws || !threadId) return;

    appendMessageElement(message, 'user');
    input.value = '';

    showTypingIndicator();

    const turnStartMessage = {
        method: "turn/start",
        params: {
            threadId: threadId,
            input: [{ type: "text", text: message }],
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

function handleApproval(decision) {
    if (!currentApprovalRequest || !ws) return;

    const response = {
        id: currentApprovalRequest.id,
        result: { decision: decision }
    };

    ws.send(JSON.stringify(response));

    // Update the UI to show decision
    // Ideally we would replace the approval card, but appending a status message is easier for now
    appendMessageElement(`<div class="text-${decision === 'accept' ? 'green' : 'red'}-400">Command ${decision === 'accept' ? 'Approved' : 'Declined'}</div>`, 'system');

    // Hide global panel if used
    const panel = document.getElementById('approval-panel');
    if (panel) panel.classList.add('hidden');

    currentApprovalRequest = null;
}

function showTypingIndicator() {
    const chatContainer = document.getElementById('chat-container');
    const typingDiv = document.createElement('div');
    typingDiv.id = 'typing-indicator';
    typingDiv.className = 'flex justify-start mb-4';
    typingDiv.innerHTML = `
        <div class="bg-gray-800 border border-gray-700 rounded-2xl px-6 py-4 shadow-lg">
            <div class="flex space-x-2">
                <div class="w-2 h-2 bg-gray-500 rounded-full animate-bounce" style="animation-delay: 0ms"></div>
                <div class="w-2 h-2 bg-gray-500 rounded-full animate-bounce" style="animation-delay: 150ms"></div>
                <div class="w-2 h-2 bg-gray-500 rounded-full animate-bounce" style="animation-delay: 300ms"></div>
            </div>
        </div>
    `;
    chatContainer.appendChild(typingDiv);
    chatContainer.scrollTop = chatContainer.scrollHeight;
}

function hideTypingIndicator() {
    const typingIndicator = document.getElementById('typing-indicator');
    if (typingIndicator) typingIndicator.remove();
}

function handleKeyPress(event) {
    if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        sendMessage();
    }
}

// Add fade-in animation
const style = document.createElement('style');
style.textContent = `
    @keyframes fade-in {
        from { opacity: 0; transform: translateY(10px); }
        to { opacity: 1; transform: translateY(0); }
    }
    .animate-fade-in {
        animation: fade-in 0.3s ease-out;
    }
`;
document.head.appendChild(style);
