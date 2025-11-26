import { ExecCommandBeginEvent } from '../codex-types/ExecCommandBeginEvent.js';
import { ExecCommandEndEvent } from '../codex-types/ExecCommandEndEvent.js';
import { AgentMessageEvent } from '../codex-types/AgentMessageEvent.js';
import { AgentReasoningEvent } from '../codex-types/AgentReasoningEvent.js';
import { ExecApprovalRequestEvent } from '../codex-types/ExecApprovalRequestEvent.js';
import { TaskCompleteEvent } from '../codex-types/TaskCompleteEvent.js';
import { TokenCountEvent } from '../codex-types/TokenCountEvent.js';
import { PatchApplyBeginEvent } from '../codex-types/PatchApplyBeginEvent.js';
import { PatchApplyEndEvent } from '../codex-types/PatchApplyEndEvent.js';
import { McpToolCallBeginEvent } from '../codex-types/McpToolCallBeginEvent.js';
import { McpToolCallEndEvent } from '../codex-types/McpToolCallEndEvent.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
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
    // Handle direct method calls like item/commandExecution/requestApproval
    if (message.method === 'item/commandExecution/requestApproval') {
      const params = message.params;
      const requestId = message.id;

      const sseData = {
        request_id: requestId,
        tool_call_id: params.itemId,
        description: `Command Execution Approval Request:\nThread: ${params.threadId}\nTurn: ${params.turnId}\nCommand ID: ${params.itemId}\nReason: ${params.reason || 'N/A'}\nRisk: ${params.risk || 'N/A'}`,
        reason: params.reason,
        risk: params.risk,
        thread_id: params.threadId,
        turn_id: params.turnId,
      };
      events.push(`event: approval_required\ndata: ${JSON.stringify(sseData)}\n\n`);
    }
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
    case 'mcp_tool_call_begin': {
      const event = msg as McpToolCallBeginEvent;
      const toolName = event.invocation.tool;
      const sseData = {
        tool_name: toolName,
        id: event.call_id,
      };
      events.push(`event: start_tool_calling\ndata: ${JSON.stringify(sseData)}\n\n`);
      break;
    }
    case 'mcp_tool_call_end': {
      const event = msg as McpToolCallEndEvent;
      const toolName = event.invocation.tool;

      let status = 'success';
      let error = null;
      let data = null;

      if ('Ok' in event.result) {
        status = event.result.Ok.isError ? 'error' : 'success';

        const content = event.result.Ok.content || [];
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const textContent = content
          .filter((c: any) => c.type === 'text')
          .map((c: any) => c.text)
          .join('\n');
        data = textContent;
        if (status === 'error') {
          error = textContent;
        }
      } else if ('Err' in event.result) {
        status = 'error';
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const err = event.result.Err as any;
        error = err?.error?.message || 'Unknown error';
      }

      const sseData = {
        tool_call_id: event.call_id,
        role: 'tool',
        description: `Called MCP tool: ${toolName}`,
        name: toolName,
        result: {
          schema_version: 'robusta:v1.0.0',
          status: status,
          error: error,
          return_code: status === 'success' ? 0 : 1,
          data: data,
          url: null,
          invocation: JSON.stringify(event.invocation),
          params: event.invocation.arguments,
          icon_url: null,
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

      // Filter out events with empty commands (duplicate/phantom events)
      if (!event.command || event.command.length === 0) {
        return events;
      }

      // For exec_approval_request, we do NOT send a request_id as per user instruction.
      // The actionable approval event comes from item/commandExecution/requestApproval.
      const sseData = {
        request_id: null,
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
    case 'plan_update': {
      const plan = msg.plan || msg.task || [];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const completedCount = plan.filter((p: any) => p.status === 'completed').length;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const inProgressCount = plan.filter((p: any) => p.status === 'in_progress').length;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const pendingCount = plan.filter((p: any) => p.status === 'pending').length;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const todos = plan.map((p: any, index: number) => ({
        id: (index + 1).toString(),
        content: p.step,
        status: p.status,
      }));

      let taskListMarkdown = '';
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      todos.forEach((todo: any) => {
        const mark = todo.status === 'completed' ? '[✓]' : '[ ]';
        taskListMarkdown += `${mark} [${todo.id}] ${todo.content}\n`;
      });

      const dataString = `✅ Investigation plan updated with ${plan.length} tasks. Tasks are now stored in session and will appear in subsequent prompts.\n\n# CURRENT INVESTIGATION TASKS\n\n**Task Status**: ${completedCount} completed, ${inProgressCount} in progress, ${pendingCount} pending\n\n${taskListMarkdown}\n\n**Instructions**: Use TodoWrite tool to update task status as you work. Mark tasks as 'in_progress' when starting, 'completed' when finished.`;

      const toolCallId = `call_${Math.random().toString(36).substr(2, 9)}`;

      // 1. start_tool_calling
      const startEventData = {
        tool_name: 'TodoWrite',
        id: toolCallId,
      };
      events.push(`event: start_tool_calling\ndata: ${JSON.stringify(startEventData)}\n\n`);

      // 2. tool_calling_result
      const resultEventData = {
        tool_call_id: toolCallId,
        role: 'tool',
        description: 'Update investigation tasks',
        name: 'TodoWrite',
        result: {
          schema_version: 'robusta:v1.0.0',
          status: 'success',
          error: null,
          return_code: null,
          data: dataString,
          url: null,
          invocation: null,
          params: {
            todos: todos,
          },
          icon_url: null,
        },
      };
      events.push(`event: tool_calling_result\ndata: ${JSON.stringify(resultEventData)}\n\n`);
      break;
    }
  }

  return events;
}
