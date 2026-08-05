import type { IncomingMessage } from 'node:http';
import type { Duplex } from 'node:stream';
import {
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import WebSocket, { type RawData, WebSocketServer } from 'ws';
import { WEBSOCKET_IDLE_TIMEOUT_MS } from '../config';
import {
  ASR_STREAM_PATH,
  AsrErrorCode,
  DEFAULT_LANGUAGE,
  DEFAULT_SAMPLE_RATE,
  type AsrConnectionOptions,
  createResponse,
  parseControlMessage,
} from '../protocol/events';
import { AsrBackendService } from './asr-backend.service';
import { type ClientConnection, SessionManager } from './session.manager';

@Injectable()
export class AsrGateway implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(AsrGateway.name);
  private readonly server = new WebSocketServer({ noServer: true });
  private httpServer: ReturnType<HttpAdapterHost['httpAdapter']['getHttpServer']> | null = null;

  constructor(
    private readonly httpAdapterHost: HttpAdapterHost,
    private readonly backendService: AsrBackendService,
    private readonly sessionManager: SessionManager,
  ) {}

  onApplicationBootstrap(): void {
    this.httpServer = this.httpAdapterHost.httpAdapter.getHttpServer();
    this.httpServer.on('upgrade', this.handleUpgrade);
    this.server.on('connection', this.handleConnection);
  }

  onApplicationShutdown(): void {
    this.httpServer?.off('upgrade', this.handleUpgrade);
    for (const connection of this.sessionManager.all()) {
      this.closeConnection(connection);
    }
    this.server.close();
  }

  private readonly handleUpgrade = (request: IncomingMessage, socket: Duplex, head: Buffer): void => {
    const url = new URL(request.url ?? '/', 'http://localhost');
    if (url.pathname !== ASR_STREAM_PATH) {
      socket.destroy();
      return;
    }
    this.server.handleUpgrade(request, socket, head, (webSocket) => {
      this.server.emit('connection', webSocket, request);
    });
  };

  private readonly handleConnection = (clientSocket: WebSocket, request: IncomingMessage): void => {
    const requestUrl = new URL(request.url ?? ASR_STREAM_PATH, 'http://localhost');
    const options = this.parseOptions(requestUrl.searchParams);
    if (!options) {
      clientSocket.send(JSON.stringify(createResponse(AsrErrorCode.InvalidQuery, 'Invalid connection query parameters')));
      clientSocket.close(1008, 'invalid query parameters');
      return;
    }

    const connection = this.sessionManager.create(clientSocket, options);
    this.refreshIdleTimer(connection);
    this.logger.log(`browser connected: ${connection.id}`);

    clientSocket.on('message', (data: RawData, isBinary: boolean) => {
      this.refreshIdleTimer(connection);
      this.handleMessage(connection, rawDataToBuffer(data), isBinary);
    });
    clientSocket.on('close', () => this.closeConnection(connection));
    clientSocket.on('error', (error: Error) => {
      this.logger.warn(`browser connection error ${connection.id}: ${error.message}`);
    });
  };

  private handleMessage(connection: ClientConnection, data: Buffer, isBinary: boolean): void {
    if (isBinary) {
      if (connection.recognitionState === 'stopping') {
        this.sendError(connection, AsrErrorCode.InvalidState, 'The current recognition session is stopping');
        return;
      }
      connection.recognitionState = 'recognizing';
      this.backendService.forward(connection, data, true);
      return;
    }

    const control = parseControlMessage(data.toString('utf8'));
    if (!control) {
      this.sendError(connection, AsrErrorCode.InvalidMessage, 'Only the {"action":"stop"} control message is supported');
      return;
    }
    if (connection.recognitionState !== 'recognizing') {
      this.sendError(connection, AsrErrorCode.InvalidState, 'No active recognition session');
      return;
    }
    connection.recognitionState = 'stopping';
    this.backendService.forward(connection, Buffer.from(JSON.stringify(control)), false);
  }

  private parseOptions(params: URLSearchParams): AsrConnectionOptions | null {
    const sampleRateValue = params.get('sampleRate');
    const sampleRate = sampleRateValue === null ? DEFAULT_SAMPLE_RATE : Number(sampleRateValue);
    const language = params.get('language') ?? DEFAULT_LANGUAGE;
    if ((sampleRate !== 8_000 && sampleRate !== 16_000) || language.trim().length === 0) {
      return null;
    }
    return { sampleRate, language };
  }

  private refreshIdleTimer(connection: ClientConnection): void {
    if (connection.idleTimer) {
      clearTimeout(connection.idleTimer);
    }
    connection.idleTimer = setTimeout(() => {
      if (connection.clientSocket.readyState === WebSocket.OPEN) {
        connection.clientSocket.close(1000, 'idle timeout');
      }
    }, WEBSOCKET_IDLE_TIMEOUT_MS);
  }

  private sendError(connection: ClientConnection, code: number, message: string): void {
    if (connection.clientSocket.readyState === WebSocket.OPEN) {
      connection.clientSocket.send(JSON.stringify(createResponse(code, message)));
    }
  }

  private closeConnection(connection: ClientConnection): void {
    if (!this.sessionManager.has(connection)) {
      return;
    }
    if (connection.idleTimer) {
      clearTimeout(connection.idleTimer);
    }
    this.sessionManager.remove(connection.clientSocket);
    this.backendService.close(connection);
    this.logger.log(`browser disconnected: ${connection.id}`);
  }
}

function rawDataToBuffer(data: RawData): Buffer {
  if (Array.isArray(data)) {
    return Buffer.concat(data);
  }
  return Buffer.isBuffer(data) ? data : Buffer.from(data);
}
