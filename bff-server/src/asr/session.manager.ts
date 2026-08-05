import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import type WebSocket from 'ws';
import type { AsrConnectionOptions } from '../protocol/events';

export type RecognitionState = 'idle' | 'recognizing' | 'stopping';
export type BackendConnectionState = 'closed' | 'connecting' | 'open';

export interface PendingFrame {
  data: Buffer;
  isBinary: boolean;
}

/** One browser connection can carry multiple sequential recognition sessions. */
export interface ClientConnection {
  id: string;
  clientSocket: WebSocket;
  options: AsrConnectionOptions;
  recognitionState: RecognitionState;
  backendSocket: WebSocket | null;
  backendState: BackendConnectionState;
  pendingFrames: PendingFrame[];
  idleTimer: ReturnType<typeof setTimeout> | null;
}

@Injectable()
export class SessionManager {
  private readonly connections = new Map<WebSocket, ClientConnection>();

  create(clientSocket: WebSocket, options: AsrConnectionOptions): ClientConnection {
    const connection: ClientConnection = {
      id: randomUUID(),
      clientSocket,
      options,
      recognitionState: 'idle',
      backendSocket: null,
      backendState: 'closed',
      pendingFrames: [],
      idleTimer: null,
    };
    this.connections.set(clientSocket, connection);
    return connection;
  }

  get(clientSocket: WebSocket): ClientConnection | undefined {
    return this.connections.get(clientSocket);
  }

  has(connection: ClientConnection): boolean {
    return this.connections.get(connection.clientSocket) === connection;
  }

  remove(clientSocket: WebSocket): ClientConnection | undefined {
    const connection = this.connections.get(clientSocket);
    this.connections.delete(clientSocket);
    return connection;
  }

  all(): ClientConnection[] {
    return [...this.connections.values()];
  }
}
