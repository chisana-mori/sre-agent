let connectionId = null;
let threadId = null;
let currentApprovalRequest = null;
let sseAbortController = null;

// Configure marked
if (typeof marked !== 'undefined') {
  marked.setOptions({
    highlight: function (code, lang) {
      return code;
    },
    breaks: true,
    gfm: true,
  });
}

// --- UI Component Renderers ---

function renderMarkdown(content) {
  if (typeof marked !== 'undefined' && typeof DOMPurify !== 'undefined') {
    const html = marked.parse(content);
    return `<div class="message-content prose prose-invert prose-sm max-w-none text-sm leading-relaxed">${DOMPurify.sanitize(html)}</div>`;
  }
  return `<div class="message-content whitespace-pre-wrap text-sm">${content}</div>`;
}

function renderAccordion(title, content) {
  const id = 'acc-' + Math.random().toString(36).substr(2, 9);
  // If content is an object, stringify it
  const contentStr = typeof content === 'object' ? JSON.stringify(content, null, 2) : content;
  const safeContent = contentStr.replace(/</g, '&lt;').replace(/>/g, '&gt;');

  return `
        <div class="border border-border rounded-md overflow-hidden mb-2 bg-background">
            <div class="accordion-header bg-muted/50 px-3 py-2 flex items-center justify-between hover:bg-muted transition-colors cursor-pointer" onclick="toggleAccordion('${id}')">
                <span class="text-xs font-medium text-muted-foreground truncate">${title}</span>
                <svg id="icon-${id}" class="w-3 h-3 text-muted-foreground transform transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path>
                </svg>
            </div>
            <div id="${id}" class="accordion-content bg-card">
                <div class="p-3 text-xs font-mono text-muted-foreground whitespace-pre-wrap overflow-x-auto">${safeContent}</div>
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
  const html = `<div id="${id}" class="diff-container my-2 rounded-md overflow-hidden border border-border"></div>`;

  const callback = () => {
    const target = document.getElementById(id);
    if (target && typeof Diff2HtmlUI !== 'undefined') {
      const diff2htmlUi = new Diff2HtmlUI(target, diffContent, {
        drawFileList: false,
        matching: 'lines',
        outputFormat: 'line-by-line',
        colorScheme: 'dark',
      });
      diff2htmlUi.draw();
    }
  };

  return { html, callback };
}

function renderApprovalRequest(event) {
  const params = event.params;
  const id = params.itemId;
  const command = params.command || 'Unknown command';

  // Store for handling
  currentApprovalRequest = event;

  // Also show the floating panel
  const panel = document.getElementById('approval-panel');
  const msg = document.getElementById('approval-message');
  if (panel && msg) {
    msg.textContent = command;
    panel.classList.remove('hidden');
  }

  return `
        <div class="bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-3 my-2">
            <div class="flex items-start gap-3">
                <div class="flex-shrink-0 mt-0.5">
                    <svg class="w-4 h-4 text-yellow-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path>
                    </svg>
                </div>
                <div class="flex-1">
                    <h3 class="text-xs font-semibold text-yellow-500 mb-1">Approval Request</h3>
                    <div class="text-xs text-muted-foreground font-mono bg-background/50 p-2 rounded mb-2 border border-border">${command}</div>
                    <div class="flex gap-2">
                        <button onclick="handleApproval('accept')" class="bg-primary text-primary-foreground hover:bg-primary/90 px-2 py-1 rounded text-xs font-medium transition-colors">
                            Approve
                        </button>
                        <button onclick="handleApproval('decline')" class="bg-destructive text-destructive-foreground hover:bg-destructive/90 px-2 py-1 rounded text-xs font-medium transition-colors">
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

  const stepsHtml = plan
    .map(
      (step, index) => `
        <div class="plan-step pb-4 relative pl-6 border-l border-border last:border-0">
            <div class="absolute left-[-5px] top-1 w-2.5 h-2.5 rounded-full border-2 border-background ${step.status === 'completed' ? 'bg-primary' : step.status === 'active' ? 'bg-primary animate-pulse' : 'bg-muted'}"></div>
            <div class="text-sm ${step.status === 'completed' ? 'text-muted-foreground line-through' : step.status === 'active' ? 'text-primary font-medium' : 'text-muted-foreground'}">
                ${step.description || step.title || 'Step ' + (index + 1)}
            </div>
        </div>
    `,
    )
    .join('');

  return `<div class="pl-2 py-2">${stepsHtml}</div>`;
}

// --- Event Handling ---

function normalizeEvent(response) {
  if (response.method && response.method.startsWith('codex/event/')) {
    if (response.params && response.params.msg) {
      const msg = response.params.msg;
      return { ...msg, type: msg.type || 'unknown_codex_event', conversationId: response.params.conversationId };
    }
  }

  if (response.method === 'item/completed') {
    if (response.params?.item?.type === 'agentMessage') {
      return { type: 'agent_message', message: response.params.item.text };
    }
  }

  if (response.method === 'item/commandExecution/requestApproval') {
    return { type: 'exec_approval_request', params: response.params, id: response.id };
  }

  if (response.method === 'turn/completed') {
    if (response.params?.turn?.status === 'failed') {
      return { type: 'error', message: response.params.turn.error?.message || 'Turn failed' };
    }
    return { type: 'task_complete', duration: response.params?.turn?.durationMs };
  }

  if (response.method === 'error') {
    return { type: 'error', message: response.params?.error?.message || 'Unknown error' };
  }

  return { type: 'unknown', original: response };
}

function appendMessageElement(html, type, callback) {
  const chatContainer = document.getElementById('chat-container');
  const welcome = document.getElementById('welcome');
  if (welcome) welcome.remove();

  const messageDiv = document.createElement('div');
  messageDiv.className = `flex gap-4 mb-6 animate-fade-in ${type === 'user' ? 'flex-row-reverse' : ''}`;

  // Avatar
  const avatar = document.createElement('div');
  avatar.className = `w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 border border-border ${type === 'user' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`;
  avatar.innerHTML =
    type === 'user'
      ? '<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>'
      : '<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8V4H8"/><rect width="16" height="12" x="4" y="8" rx="2"/><path d="M2 14h2"/><path d="M20 14h2"/><path d="M15 13v2"/><path d="M9 13v2"/></svg>';

  // Content Bubble
  const bubble = document.createElement('div');
  bubble.className = `relative max-w-[85%] rounded-2xl px-4 py-3 text-sm shadow-sm ${type === 'user' ? 'bg-primary text-primary-foreground' : 'bg-muted/50 text-foreground border border-border'
    }`;

  bubble.innerHTML = html;

  messageDiv.appendChild(avatar);
  messageDiv.appendChild(bubble);

  chatContainer.appendChild(messageDiv);
  chatContainer.scrollTop = chatContainer.scrollHeight;

  if (callback) callback();
}

function handleEvent(response) {
  const event = normalizeEvent(response);
  console.log('Normalized Event:', event);

  if (event.type === 'user_message') {
    appendMessageElement(event.message, 'user');
    return;
  }

  switch (event.type) {
    case 'agent_message':
      appendMessageElement(renderMarkdown(event.message), 'assistant');
      break;

    case 'exec_approval_request':
      appendMessageElement(renderApprovalRequest(event), 'assistant');
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
      break;

    case 'error':
      appendMessageElement(`<div class="text-destructive font-medium">Error: ${event.message}</div>`, 'system');
      break;

    case 'unknown':
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
    statusDot.className = 'w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse';
    statusText.textContent = 'Connected';
    connectBtn.textContent = 'Disconnect';
    connectBtn.className =
      'text-xs font-medium bg-destructive text-destructive-foreground hover:bg-destructive/90 px-3 py-1.5 rounded-md transition-colors';
    messageInput.disabled = false;
    sendBtn.disabled = false;
  } else {
    statusDot.className = 'w-1.5 h-1.5 rounded-full bg-destructive';
    statusText.textContent = 'Disconnected';
    connectBtn.textContent = 'Connect';
    connectBtn.className =
      'text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90 px-3 py-1.5 rounded-md transition-colors';
    messageInput.disabled = true;
    sendBtn.disabled = true;
  }
}

function toggleConnection() {
  if (sseAbortController) {
    disconnect();
  } else {
    connect();
  }
}

function disconnect() {
  const wasConnected = !!connectionId || !!sseAbortController;

  if (sseAbortController) {
    sseAbortController.abort();
  }
  sseAbortController = null;
  connectionId = null;
  threadId = null;
  hideTypingIndicator();
  updateStatus(false);
  if (wasConnected) {
    appendMessageElement('<div class="text-muted-foreground">✗ Disconnected</div>', 'system');
  }
}

// Open SSE and optionally send the first user message in the same request payload
async function connect(initialUserMessage = null) {
  connectionId = `conn-${Date.now().toString(36)}`;
  sseAbortController = new AbortController();

  try {
    const response = await fetch('/api/stream/investigate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'text/event-stream',
      },
      body: JSON.stringify({
        connectionId,
        payload: initialUserMessage ? { input: initialUserMessage } : undefined,
      }),
      signal: sseAbortController.signal,
    });

    if (!response.ok || !response.body) {
      throw new Error('Failed to open SSE connection');
    }

    updateStatus(true);
    appendMessageElement('<div class="text-green-500">✓ Connected to SRE Agent</div>', 'system');
    startSseStream(response.body.getReader());
  } catch (error) {
    console.error('SSE connection error:', error);
    appendMessageElement('<div class="text-destructive">❌ Connection error</div>', 'system');
    disconnect();
  }
}

function startSseStream(reader) {
  const decoder = new TextDecoder();
  let buffer = '';

  const processBuffer = () => {
    let separatorIndex = buffer.indexOf('\n\n');
    while (separatorIndex !== -1) {
      const rawEvent = buffer.slice(0, separatorIndex);
      buffer = buffer.slice(separatorIndex + 2);
      if (rawEvent.trim()) {
        handleSseEvent(rawEvent);
      }
      separatorIndex = buffer.indexOf('\n\n');
    }
  };

  const read = async () => {
    if (!reader) return;

    try {
      const { done, value } = await reader.read();
      if (done) {
        disconnect();
        return;
      }
      buffer += decoder.decode(value, { stream: true });
      processBuffer();
      read();
    } catch (error) {
      console.error('Failed to read SSE stream', error);
      appendMessageElement('<div class="text-destructive">❌ Connection error</div>', 'system');
      disconnect();
    }
  };

  read();
}

async function sendToServer(payload) {
  if (!connectionId) {
    throw new Error('Not connected');
  }

  try {
    const response = await fetch('/api/stream/investigate/send', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ connectionId, payload }),
    });

    if (!response.ok) {
      throw new Error('Server rejected payload');
    }
  } catch (error) {
    console.error('Failed to send payload to server', error);
    appendMessageElement('<div class="text-destructive">❌ Failed to send message</div>', 'system');
  }
}

function handleSseEvent(rawEvent) {
  const lines = rawEvent.split('\n');
  let eventType = null;
  const dataLines = [];

  for (const line of lines) {
    if (line.startsWith('event: ')) {
      eventType = line.substring(7).trim();
    } else if (line.startsWith('data: ')) {
      dataLines.push(line.substring(6));
    }
  }

  const dataText = dataLines.join('\n');
  let data = null;

  if (dataText) {
    try {
      data = JSON.parse(dataText);
    } catch (e) {
      console.error('Failed to parse SSE data', e);
    }
  }

  if (!eventType || !data) return;

  if (eventType === 'rpc_result') {
    const response = data;
    // Capture server-started thread id
    if (response.result?.thread?.id) {
      threadId = response.result.thread.id;
      appendMessageElement(`<div class="text-green-500">✓ Thread ready (${threadId.substring(0, 8)}...)</div>`, 'system');
    }
    return;
  }

  hideTypingIndicator();

  let internalEvent = null;

  if (eventType === 'connection_ack') {
    // Make sure we're using the server-confirmed connection ID
    if (data.connectionId) {
      connectionId = data.connectionId;
    }

    appendMessageElement('<div class="text-green-500">✓ Connection acknowledged</div>', 'system');

    return;
  }

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
        id: data.tool_call_id,
      };
      break;
    case 'tool_calling_result':
      break;
    case 'ai_answer_end':
      internalEvent = { type: 'task_complete' };
      break;
    case 'process_exit':
      appendMessageElement(
        `<div class="text-destructive font-medium">Codex process exited${data.code !== undefined ? ` (code ${data.code})` : ''
        }${data.signal ? `, signal ${data.signal}` : ''}. Check server logs for details.</div>`,
        'system',
      );
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
}

async function sendMessage() {
  const input = document.getElementById('message-input');
  const message = input.value.trim();

  if (!message) return;

  // If not connected yet, open SSE and send the first message in the same request
  if (!connectionId || !threadId) {
    appendMessageElement(message, 'user');
    input.value = '';
    showTypingIndicator();
    await connect(message);
    return;
  }

  appendMessageElement(message, 'user');
  input.value = '';

  showTypingIndicator();

  const turnStartMessage = {
    method: 'turn/start',
    params: {
      threadId: threadId,
      input: [{ type: 'text', text: message }],
      cwd: null,
      approvalPolicy: null,
      sandboxPolicy: null,
      model: null,
      effort: null,
      summary: null,
    },
    id: Date.now(),
  };

  await sendToServer(turnStartMessage);
}

async function handleApproval(decision) {
  if (!currentApprovalRequest || !connectionId) return;

  const response = {
    id: currentApprovalRequest.id,
    result: { decision: decision },
  };

  await sendToServer(response);

  appendMessageElement(
    `<div class="text-${decision === 'accept' ? 'green' : 'red'}-500">Command ${decision === 'accept' ? 'Approved' : 'Declined'}</div>`,
    'system',
  );

  const panel = document.getElementById('approval-panel');
  if (panel) panel.classList.add('hidden');

  currentApprovalRequest = null;
}

function showTypingIndicator() {
  const chatContainer = document.getElementById('chat-container');
  const typingDiv = document.createElement('div');
  typingDiv.id = 'typing-indicator';
  typingDiv.className = 'flex gap-4 mb-6 animate-fade-in';

  typingDiv.innerHTML = `
        <div class="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 border border-border bg-muted text-muted-foreground">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8V4H8"/><rect width="16" height="12" x="4" y="8" rx="2"/><path d="M2 14h2"/><path d="M20 14h2"/><path d="M15 13v2"/><path d="M9 13v2"/></svg>
        </div>
        <div class="relative max-w-[85%] rounded-2xl px-4 py-3 text-sm shadow-sm bg-muted/50 text-foreground border border-border">
            <div class="flex space-x-1 h-5 items-center">
                <div class="w-1.5 h-1.5 bg-muted-foreground rounded-full animate-bounce" style="animation-delay: 0ms"></div>
                <div class="w-1.5 h-1.5 bg-muted-foreground rounded-full animate-bounce" style="animation-delay: 150ms"></div>
                <div class="w-1.5 h-1.5 bg-muted-foreground rounded-full animate-bounce" style="animation-delay: 300ms"></div>
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

// No auto-connect: connection is opened when the user sends the first message.
