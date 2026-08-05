import { Injectable, Logger } from '@nestjs/common';
import WebSocket, { type RawData } from 'ws';
import { BACKEND_CONNECT_TIMEOUT_MS, BACKEND_URL } from '../config';
import {
  ASR_STREAM_PATH,
  AsrErrorCode,
  createResponse,
  parseAsrResponse,
} from '../protocol/events';
import { type ClientConnection, SessionManager } from './session.manager';

@Injectable()
export class AsrBackendService {
  private readonly logger = new Logger(AsrBackendService.name);

  constructor(private readonly sessionManager: SessionManager) {}

  /** Queue a frame while the backend is connecting, then preserve wire order. */
  forward(connection: ClientConnection, data: Buffer, isBinary: boolean): void {
    if (connection.backendState === 'open' && connection.backendSocket) {
      connection.backendSocket.send(data, { binary: isBinary });
      return;
    }

    connection.pendingFrames.push({ data: Buffer.from(data), isBinary });
    if (connection.backendState === 'closed') {
      this.connect(connection);
    }
  }

  close(connection: ClientConnection): void {
    connection.pendingFrames = [];
    connection.backendState = 'closed';
    const socket = connection.backendSocket;
    connection.backendSocket = null;
    if (socket && socket.readyState !== WebSocket.CLOSED) {
      socket.close(1000, 'browser connection closed');
    }
  }

  private connect(connection: ClientConnection): void {
    connection.backendState = 'connecting';
    const query = new URLSearchParams({
      sampleRate: String(connection.options.sampleRate),
      language: connection.options.language,
    });
    const socket = new WebSocket(`${BACKEND_URL}${ASR_STREAM_PATH}?${query.toString()}`);
    connection.backendSocket = socket;

    let settled = false;
    const connectTimer = setTimeout(() => {
      settled = true;
      if (socket.readyState === WebSocket.CONNECTING) {
        socket.terminate();
      }
      this.failConnection(connection, AsrErrorCode.BackendTimeout, 'ASR service connection timed out');
    }, BACKEND_CONNECT_TIMEOUT_MS);

    socket.on('open', () => {
      settled = true;
      clearTimeout(connectTimer);
      if (!this.sessionManager.has(connection)) {
        socket.close();
        return;
      }
      connection.backendState = 'open';
      this.logger.log(`ASR backend connected for browser connection ${connection.id}`);
      const frames = connection.pendingFrames;
      connection.pendingFrames = [];
      for (const frame of frames) {
        socket.send(frame.data, { binary: frame.isBinary });
      }
    });

    socket.on('message', (data: RawData, isBinary: boolean) => {
      if (!this.sessionManager.has(connection)) {
        return;
      }
      if (isBinary) {
        this.failConnection(connection, AsrErrorCode.BackendUnavailable, 'ASR service returned an invalid response');
        socket.close(1002, 'invalid ASR response');
        return;
      }
      const response = parseAsrResponse(rawDataToBuffer(data).toString('utf8'));
      if (!response) {
        this.failConnection(connection, AsrErrorCode.BackendUnavailable, 'ASR service returned an invalid response');
        socket.close(1002, 'invalid ASR response');
        return;
      }
      if (response.data.isFinal || response.code !== 0) {
        connection.recognitionState = 'idle';
      }
      this.sendToBrowser(connection, response);
    });

    socket.on('error', (error: Error) => {
      this.logger.warn(`ASR backend error for ${connection.id}: ${error.message}`);
    });

    socket.on('close', () => {
      clearTimeout(connectTimer);
      if (connection.backendSocket !== socket) {
        return;
      }
      connection.backendSocket = null;
      connection.backendState = 'closed';
      if (!this.sessionManager.has(connection)) {
        return;
      }
      if (!settled || connection.recognitionState !== 'idle') {
        this.failConnection(connection, AsrErrorCode.BackendUnavailable, 'ASR service is unavailable');
      }
    });
  }

  private failConnection(connection: ClientConnection, code: number, message: string): void {
    connection.pendingFrames = [];
    connection.recognitionState = 'idle';
    this.sendToBrowser(connection, createResponse(code, message));
  }

  private sendToBrowser(connection: ClientConnection, response: object): void {
    if (connection.clientSocket.readyState === WebSocket.OPEN) {
      connection.clientSocket.send(JSON.stringify(response));
    }
  }
}

function rawDataToBuffer(data: RawData): Buffer {
  if (Array.isArray(data)) {
    return Buffer.concat(data);
  }
  return Buffer.isBuffer(data) ? data : Buffer.from(data);
}
