import { ExecCommandBeginEvent } from '../codex-types/ExecCommandBeginEvent.js';
import { ExecCommandEndEvent } from '../codex-types/ExecCommandEndEvent.js';
import { AgentMessageEvent } from '../codex-types/AgentMessageEvent.js';
import { AgentReasoningEvent } from '../codex-types/AgentReasoningEvent.js';
import { ExecApprovalRequestEvent } from '../codex-types/ExecApprovalRequestEvent.js';
import { TaskCompleteEvent } from '../codex-types/TaskCompleteEvent.js';
import { TokenCountEvent } from '../codex-types/TokenCountEvent.js';
import { PatchApplyBeginEvent } from '../codex-types/PatchApplyBeginEvent.js';
import { PatchApplyEndEvent } from '../codex-types/PatchApplyEndEvent.js';

interface CodexMessage {
  method: string;
  params: {
    id: string;
    msg: any;
    conversationId: string;
  };
}

export function convertCodexMessageToSSE(message: any): string[] {
  const events: string[] = [];

  // Handle JSON-RPC responses (handshake etc)
  if (message.id && message.result) {
    const sseData = {
      id: message.id,
      result: message.result,
    };
    events.push(`event: rpc_result\ndata: ${JSON.stringify(sseData)}\n\n`);
    return events;
  }

  if (!message || !message.params || !message.params.msg) {
    return events;
  }

  const { msg } = message.params;

  if (!msg || !msg.type) {
    return events;
  }

  switch (msg.type) {
    case 'exec_command_begin': {
      const event = msg as ExecCommandBeginEvent;
      const toolName = event.command[0] || 'shell_exec';
      const sseData = {
        tool_name: toolName,
        id: event.call_id,
      };
      events.push(`event: start_tool_calling\ndata: ${JSON.stringify(sseData)}\n\n`);
      break;
    }
    case 'exec_command_end': {
      const event = msg as ExecCommandEndEvent;
      const toolName = event.command[0] || 'shell_exec';
      const sseData = {
        tool_call_id: event.call_id,
        role: 'tool',
        description: event.command.join(' '),
        name: toolName,
        result: {
          schema_version: 'robusta:v1.0.0',
          status: event.exit_code === 0 ? 'success' : 'error',
          error: event.exit_code !== 0 ? event.stderr || 'Command failed' : null,
          return_code: event.exit_code,
          data: event.formatted_output || event.stdout,
          url: null,
          invocation: event.command.join(' '),
          params: {},
          icon_url: null,
        },
      };
      events.push(`event: tool_calling_result\ndata: ${JSON.stringify(sseData)}\n\n`);
      break;
    }
    case 'patch_apply_begin': {
      const event = msg as PatchApplyBeginEvent;
      const sseData = {
        tool_name: 'apply_patch',
        id: event.call_id,
      };
      events.push(`event: start_tool_calling\ndata: ${JSON.stringify(sseData)}\n\n`);
      break;
    }
    case 'patch_apply_end': {
      const event = msg as PatchApplyEndEvent;
      const fileNames = event.changes ? Object.keys(event.changes).join(', ') : '';
      const sseData = {
        tool_call_id: event.call_id,
        role: 'tool',
        description: `Applied patch to files: ${fileNames}`,
        name: 'apply_patch',
        result: {
          stdout: event.stdout,
          stderr: event.stderr,
          success: event.success,
        },
      };
      events.push(`event: tool_calling_result\ndata: ${JSON.stringify(sseData)}\n\n`);
      break;
    }
    case 'agent_message': {
      const event = msg as AgentMessageEvent;
      const sseData = {
        content: event.message,
      };
      events.push(`event: ai_message\ndata: ${JSON.stringify(sseData)}\n\n`);
      break;
    }
    case 'agent_reasoning': {
      const event = msg as AgentReasoningEvent;
      const sseData = {
        content: event.text,
        is_reasoning: true,
      };
      events.push(`event: ai_message\ndata: ${JSON.stringify(sseData)}\n\n`);
      break;
    }
    case 'exec_approval_request': {
      const event = msg as ExecApprovalRequestEvent;
      const sseData = {
        tool_call_id: event.call_id,
        description: event.command.join(' '),
        reason: event.reason,
        risk: event.risk,
      };
      events.push(`event: approval_required\ndata: ${JSON.stringify(sseData)}\n\n`);
      break;
    }
    case 'task_complete': {
      const event = msg as TaskCompleteEvent;
      const sseData = {
        sections: {}, // Placeholder as per example
        analysis: event.last_agent_message,
      };
      events.push(`event: ai_answer_end\ndata: ${JSON.stringify(sseData)}\n\n`);
      break;
    }
    case 'token_count': {
      const event = msg as TokenCountEvent;
      // TokenCountEvent structure needs to be checked.
      // Assuming it has some token info.
      events.push(`event: token_count\ndata: ${JSON.stringify(event)}\n\n`);
      break;
    }
    case 'error':
    case 'stream_error': {
      const sseData = {
        error: msg.message || 'Unknown error',
      };
      events.push(`event: error\ndata: ${JSON.stringify(sseData)}\n\n`);
      break;
    }
    case 'user_message': {
      // Optional: echo user message if needed, or ignore.
      // The user didn't explicitly ask for it in the target list, but it might be useful.
      // I'll skip it for now to strictly follow the target list,
      // unless I see "conversation_history_compacted" which might be related.
      break;
    }
    // Add other cases as needed
  }

  return events;
}
