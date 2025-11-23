// SSE client that sends the alert payload to /api/stream/investigate and
// prints streamed events from the server.

const payload = {
  cache_control: {
    bypass_cache: false,
    prefer_cache: false,
  },
  context: {
    response_language: 'zh-CN',
  },
  force_refresh: false,
  include_tool_call_results: true,
  include_tool_calls: true,
  prefer_cache: false,
  prompt_template: 'builtin://generic_investigation.jinja2',
  source: 'webui',
  source_instance_id: 'backend',
  subject: {
    labels: {
      alertname: 'HighMemoryUsage',
      beta_kubernetes_io_arch: 'arm64',
      beta_kubernetes_io_os: 'linux',
      container: 'alertmanager',
      image: 'docker.io/prom/alertmanager:v0.26.0',
      instance: 'kind-worker',
      job: 'kubernetes-cadvisor',
      kubernetes_io_arch: 'arm64',
      kubernetes_io_hostname: 'kind-worker',
      kubernetes_io_os: 'linux',
      namespace: 'robusta',
      node: 'kind-worker',
      pod: 'alertmanager-standalone-6c6579dbf6-nwvb6',
      severity: 'warning',
    },
    severity: 'medium',
    starts_at: '2025-11-23T07:21:55Z',
    status: 'firing',
    title: 'HighMemoryUsage',
  },
  title: 'HighMemoryUsage',
};

async function main() {
  const res = await fetch('http://localhost:8081/api/stream/investigate', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'text/event-stream',
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok || !res.body) {
    console.error('Failed to open SSE stream', res.status, res.statusText);
    const text = await res.text().catch(() => '');
    if (text) console.error(text);
    return;
  }

  console.log('SSE stream opened. Listening for events...\n');
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  const processBuffer = () => {
    let sep = buffer.indexOf('\n\n');
    while (sep !== -1) {
      const raw = buffer.slice(0, sep).trim();
      buffer = buffer.slice(sep + 2);
      if (raw) {
        handleEvent(raw);
      }
      sep = buffer.indexOf('\n\n');
    }
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      console.log('\nSSE stream closed by server.');
      break;
    }
    buffer += decoder.decode(value, { stream: true });
    processBuffer();
  }
}

let activeConnectionId: string | null = null;
let lastRpcResultId: string | number | null = null;

function handleEvent(raw: string) {
  let eventType: string | null = null;
  const dataLines: string[] = [];

  raw.split('\n').forEach((line) => {
    if (line.startsWith('event: ')) {
      eventType = line.substring(7).trim();
    } else if (line.startsWith('data: ')) {
      dataLines.push(line.substring(6));
    }
  });

  const dataText = dataLines.join('\n');
  let data: any = dataText;
  try {
    data = JSON.parse(dataText);
  } catch {
    // keep raw text if not JSON
  }

  console.log(`\n[event: ${eventType || 'unknown'}]`);
  console.log(data);

  if (eventType === 'approval_required') {
    // 使用审批请求中的 request_id，这是 Codex 期望的 ID
    const approvalId = data.request_id;
    if (approvalId !== undefined && approvalId !== null) {
      console.log('Approval required! Auto-approving...');
      sendApproval(approvalId);
    } else {
      console.warn('Ignoring approval request without request_id (likely informational):', data);
    }
  } else if (eventType === 'connection_ack') {
    activeConnectionId = data.connectionId;
    console.log('Captured connectionId:', activeConnectionId);
  } else if (eventType === 'rpc_result') {
    if (data.id !== undefined) {
      lastRpcResultId = data.id;
      console.log('Captured rpc_result id:', lastRpcResultId);
    }
  }
}

async function sendApproval(requestId: string | number) {
  if (!activeConnectionId) {
    console.error('Cannot send approval: No connectionId');
    return;
  }

  // 审批响应的 id 应该使用审批请求中的 request_id
  const payload = {
    connectionId: activeConnectionId,
    id: requestId, // 使用审批请求的 request_id，而不是 lastRpcResultId
    result: {
      decision: 'accept',
    },
  };

  console.log('Approval payload:', payload);
  try {
    const res = await fetch('http://localhost:8081/api/stream/investigate/send', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });
    console.log('Approval sent:', res.status);
    const responseText = await res.text();
    if (responseText) {
      console.log('Response:', responseText);
    }
  } catch (e) {
    console.error('Failed to send approval:', e);
  }
}

main().catch((err) => {
  console.error('Stream failed:', err);
});
