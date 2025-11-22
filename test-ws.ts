import WebSocket from 'ws';
import * as readline from 'readline';

const ws = new WebSocket('ws://localhost:3000/api/v1/sre/socket');

// Create readline interface for user input
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

// Helper function to prompt user for approval
function promptApproval(message: string, itemId: string, requestId: number | null): void {
    rl.question(`\n${message}\nApprove? (y/n): `, (answer) => {
        const decision = answer.toLowerCase() === 'y' ? 'accept' : 'decline';

        const approvalResponse = {
            id: requestId,
            result: {
                decision: decision
            }
        };

        console.log(`\nSending approval decision: ${decision}`);
        ws.send(JSON.stringify(approvalResponse));
    });
}

ws.on('open', () => {
    const initMessage = {
        method: "initialize",
        params: {
            clientInfo: {
                name: "sre-agent-test",
                version: "1.0.0",
                title: "test"
            }
        },
        id: 1
    };

    console.log('Sending Initialize:', JSON.stringify(initMessage, null, 2));
    ws.send(JSON.stringify(initMessage));
});

ws.on('message', (data) => {
    console.log('Received:', data.toString());
    const response = JSON.parse(data.toString());

    // If initialization successful, start a thread
    if (response.id === 1 && !response.error) {
        const threadStartMessage = {
            method: "thread/start",
            params: {
                cwd: process.cwd(),
                model: null,
                modelProvider: null,
                approvalPolicy: null,
                sandbox: null,
                config: null,
                baseInstructions: null,
                developerInstructions: null
            },
            id: 2
        };
        console.log('Starting Thread:', JSON.stringify(threadStartMessage, null, 2));
        ws.send(JSON.stringify(threadStartMessage));
    }
    // If thread started, send a turn with user input
    else if (response.id === 2 && response.result?.thread?.id) {
        const turnStartMessage = {
            method: "turn/start",
            params: {
                threadId: response.result.thread.id,
                input: [
                    {
                        type: "text",
                        text: "Check disk usage on localhost"
                    }
                ],
                cwd: null,
                approvalPolicy: null,
                sandboxPolicy: null,
                model: null,
                effort: null,
                summary: null
            },
            id: 3
        };
        console.log('Starting Turn:', JSON.stringify(turnStartMessage, null, 2));
        ws.send(JSON.stringify(turnStartMessage));
    }
    // Handle command execution approval request
    else if (response.method === 'item/commandExecution/requestApproval') {
        const params = response.params;
        const requestId = response.id;
        promptApproval(
            `🔔 Command Execution Approval Request:\nThread: ${params.threadId}\nTurn: ${params.turnId}\nCommand ID: ${params.itemId}\nReason: ${params.reason || 'N/A'}\nRisk: ${params.risk || 'N/A'}`,
            params.itemId,
            requestId
        );
    }
    // Handle file change approval request
    else if (response.method === 'item/fileChange/requestApproval') {
        const params = response.params;
        const requestId = response.id;
        promptApproval(
            `🔔 File Change Approval Request:\nFile: ${params.itemId}`,
            params.itemId,
            requestId
        );
    }
});

ws.on('error', (error) => {
    console.error('WebSocket error:', error);
});

ws.on('close', () => {
    console.log('Disconnected');
    rl.close();
    process.exit(0);
});
