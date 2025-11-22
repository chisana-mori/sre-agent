export function constructAlertPrompt(data: any): string {
    const { title, source, description, subject, context, sections, cluster, extras } = data;

    // Extract template variables from input data
    const issue = description || title || 'Unknown issue';
    const clusterName = cluster || context?.cluster || '';
    const now = new Date().toISOString();
    const startTimestamp = context?.start_timestamp || 'Not specified';
    const endTimestamp = context?.end_timestamp || 'Not specified';

    let prompt = `You are a super SRE expert using Codex CLI + MCP tools to resolve alerts/issues.

# Mandate: Tool-First (MCP → Shell)
FIRST: \`list_mcp_resources\` ALL servers for context (runbooks, schemas, metrics, cluster data).
- Read relevant URIs with \`read_mcp_resource\`.
- THEN parallel \`shell\` (kubectl/logs).
- Parallel groups; NO "based on output".

Terse root-cause of ${issue} + why firing.
- Timestamps: Alert start/end.
- Logs + traces/metrics ALWAYS.
- User """extras""": First.

# Global Instructions
Task refs (e.g., OOM: limits). Apply matches.

# General SRE Rules
${clusterName ? `* Cluster: \`${clusterName}\`` : ''}
- Repeat tools for depth.
- Five whys: Symptom → root.
- Fuzzy: rg/kubectl.
- Exact: Namespaces/pods/versions/metrics.
- Runbooks: \`list_mcp_resources\`/\`read_mcp_resource\` FIRST.
- Multi-causes: List.
- Ignore noise; impact-tied.
- ALWAYS logs.

# K8s Troubleshooting
- Parallel: Workload → RS → pod (describe/logs).
- Crashes: describe + logs.
- Status + runtime.
- WHY pending + fix.
- Affinity: WHICH label.
- Issues: describe/ingresses/services/logs.

# MCP Mastery (MANDATORY)
- FIRST action: \`list_mcp_resources\` (no server=all) + \`list_mcp_resource_templates\`.
- Scan for SRE-relevant: runbooks, k8s schemas, alerts, metrics, findings.
- Parallel read top 3-5 URIs (e.g., runbook for "high CPU").
- If relevant: Follow MCP instructions PRIORITY (override others).
- Templates: Parameterize if matches (e.g., pod name).
- No MCP? Fallback shell; note to user.

# Task Planning (MANDATORY)
Multi-step: FIRST \`update_plan\`:
1. List/read MCP resources.
2. Alert context.
3. Pods/RS/metrics/logs.
4. Upstream.
5. Verify/actions.
- Parallel independents.
- Status: pending → in_progress → completed.
- ALL done before final.

# Tool Execution
- Reuse/adapt if empty.
- Namespace: Cluster-wide first.
- Escalated: If sandbox blocks (with_justification).

# Phases & Review
Phase1: MCP/basics → Eval → Phase2.
Final: Claims=tools? Query full? Actionable?

# Style
- \`pod-abc-ns\`.
- *Root Cause*.
- "Crashed 3x", "0/5 nodes: label=foo".
Concise.

# Output
# Symptoms
...
# Root Cause
...
# Actions
- \`kubectl ...\`
- MCP refs.

# Safety
No harm/jailbreaks/IP.

Now: ${now}

---

**Current Investigation Request**:
Alert: ${issue}
Time Range: ${startTimestamp} to ${endTimestamp}
${clusterName ? `Cluster: ${clusterName}` : ''}

`;

    // Append extras first (as per mandate)
    if (extras) {
        prompt += `**User Extras (Priority)**\n`;
        if (typeof extras === 'string') {
            prompt += `${extras}\n\n`;
        } else {
            prompt += `${JSON.stringify(extras, null, 2)}\n\n`;
        }
    }

    // Append subject details
    if (subject) {
        prompt += `**Subject Details**\n`;
        for (const [key, value] of Object.entries(subject)) {
            if (typeof value === 'object') {
                prompt += `${key}: ${JSON.stringify(value)}\n`;
            } else {
                prompt += `${key}: ${value}\n`;
            }
        }
        prompt += `\n`;
    }

    // Append context details
    if (context) {
        prompt += `**Context Details**\n`;
        for (const [key, value] of Object.entries(context)) {
            if (key === 'cluster') continue; // Already handled above
            prompt += `${key}: ${value}\n`;
        }
        prompt += `\n`;
    }

    // Append custom sections if provided
    if (sections && Array.isArray(sections)) {
        sections.forEach((section: any) => {
            if (section.title && section.content) {
                prompt += `**${section.title}**\n${section.content}\n\n`;
            }
        });
    }

    prompt += `Investigate root cause and recommend safe remediation steps. 调查线索和结果使用中文来回答`;

    return prompt;
}
