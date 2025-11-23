import type { SSEConnection, PendingRequest } from '../types/index.js';
import { generateConnectionId, generateRequestId } from '../utils/common-utils.js';

export class ConnectionManager {
  private connections: Map<string, SSEConnection> = new Map();
  private pendingRequests: Map<number, PendingRequest> = new Map();

  constructor() {}

  addConnection(connectionId: string, connection: SSEConnection): void {
    this.connections.set(connectionId, connection);
  }

  getConnection(connectionId: string): SSEConnection | undefined {
    return this.connections.get(connectionId);
  }

  removeConnection(connectionId: string): void {
    const connection = this.connections.get(connectionId);
    if (connection) {
      if (connection.heartbeat) {
        clearInterval(connection.heartbeat);
      }
      this.connections.delete(connectionId);
    }
  }

  hasConnection(connectionId: string): boolean {
    return this.connections.has(connectionId);
  }

  addPendingRequest(type: 'init_alert', payload: any): number {
    const reqId = generateRequestId();
    this.pendingRequests.set(reqId, { type, payload });
    return reqId;
  }

  getPendingRequest(reqId: number): PendingRequest | undefined {
    return this.pendingRequests.get(reqId);
  }

  removePendingRequest(reqId: number): void {
    this.pendingRequests.delete(reqId);
  }

  getAllPendingRequests(): Map<number, PendingRequest> {
    return this.pendingRequests;
  }

  getAllConnections(): Map<string, SSEConnection> {
    return this.connections;
  }
}

export const connectionManager = new ConnectionManager();
