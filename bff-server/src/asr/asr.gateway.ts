import type { IncomingMessage } from 'node:http';
import { Logger, type OnApplicationShutdown } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
} from '@nestjs/websockets';
import WebSocket, { type RawData } from 'ws';
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
import { ASR_MESSAGE_EVENT } from '../protocol/native-ws.adapter';
import { AsrBackendService } from './asr-backend.service';
import { type ClientConnection, SessionManager } from './session.manager';

@WebSocketGateway({ path: ASR_STREAM_PATH })
export class AsrGateway
  implements OnGatewayConnection, OnGatewayDisconnect, OnApplicationShutdown
{
  private readonly logger = new Logger(AsrGateway.name);

  constructor(
    private readonly backendService: AsrBackendService,
    private readonly sessionManager: SessionManager,
  ) {}

  onApplicationShutdown(): void {
    for (const connection of this.sessionManager.all()) {
      this.closeConnection(connection);
    }
  }

  handleConnection(clientSocket: WebSocket, request: IncomingMessage): void {
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

    clientSocket.on('error', (error: Error) => {
      this.logger.warn(`browser connection error ${connection.id}: ${error.message}`);
    });
  }

  handleDisconnect(clientSocket: WebSocket): void {
    const connection = this.sessionManager.get(clientSocket);
    if (connection) {
      this.closeConnection(connection);
    }
  }

  @SubscribeMessage(ASR_MESSAGE_EVENT)
  handleMessage(
    @ConnectedSocket() clientSocket: WebSocket,
    @MessageBody() data: string | RawData,
  ): void {
    const connection = this.sessionManager.get(clientSocket);
    if (!connection) {
      return;
    }
    this.refreshIdleTimer(connection);

    const isBinary = typeof data !== 'string';
    const buffer = rawDataToBuffer(data);
    if (isBinary) {
      if (connection.recognitionState === 'stopping') {
        this.sendError(connection, AsrErrorCode.InvalidState, 'The current recognition session is stopping');
        return;
      }
      connection.recognitionState = 'recognizing';
      this.backendService.forward(connection, buffer, true);
      return;
    }

    const control = parseControlMessage(buffer.toString('utf8'));
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

function rawDataToBuffer(data: string | RawData): Buffer {
  if (typeof data === 'string') {
    return Buffer.from(data);
  }
  if (Array.isArray(data)) {
    return Buffer.concat(data);
  }
  if (Buffer.isBuffer(data)) {
    return data;
  }
  return Buffer.from(data);
}
