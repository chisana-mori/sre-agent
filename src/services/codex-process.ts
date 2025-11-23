import { spawn, ChildProcess } from 'child_process';
import * as readline from 'readline';
import { EventEmitter } from 'events';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Point to the actual binary in the installed package
const CODEX_BINARY_PATH = path.resolve(
  __dirname,
  '../../node_modules/@openai/codex/vendor/aarch64-apple-darwin/codex/codex',
);

export class CodexProcess extends EventEmitter {
  private process: ChildProcess | null = null;
  private rl: readline.Interface | null = null;

  constructor() {
    super();
  }

  public start(env: NodeJS.ProcessEnv = process.env) {
    // Use codex default authentication (ChatGPT login or OPENAI_API_KEY from user's environment)
    // No custom env var mapping needed - codex binary handles this automatically

    // Build command-line args with default configuration
    const args = [
      'app-server',
      // Set default approval policy to require approval for all commands
      // Valid values: untrusted, on-failure, on-request, never
      '-c',
      'approval_policy="untrusted"',
      // Set default sandbox mode to workspace-write
      // '-c', 'sandbox_permissions=["workspace-write"]'
    ];

    this.process = spawn(CODEX_BINARY_PATH, args, {
      env: env,
      stdio: ['pipe', 'pipe', 'inherit'], // Pipe stdin/stdout, inherit stderr
    });

    if (!this.process.stdout || !this.process.stdin) {
      throw new Error('Failed to spawn codex app-server: stdin/stdout not available');
    }

    this.rl = readline.createInterface({
      input: this.process.stdout,
      terminal: false,
    });

    this.rl.on('line', (line) => {
      if (line.trim()) {
        try {
          const message = JSON.parse(line);
          this.emit('message', message);
        } catch (error) {
          console.error('Failed to parse JSON from codex:', line, error);
        }
      }
    });

    this.process.on('exit', (code, signal) => {
      this.emit('exit', { code, signal });
      this.process = null;
      this.rl = null;
    });

    this.process.on('error', (error) => {
      this.emit('error', error);
    });
  }

  public send(message: any) {
    if (this.process && this.process.stdin) {
      const line = JSON.stringify(message) + '\n';
      this.process.stdin.write(line);
    } else {
      throw new Error('Codex process is not running');
    }
  }

  public stop() {
    if (this.process) {
      this.process.kill();
    }
  }
}
