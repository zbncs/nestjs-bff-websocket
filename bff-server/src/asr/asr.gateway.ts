import { Logger } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
} from '@nestjs/websockets';
import type { Socket } from 'socket.io';
import {
  AsrAudioPayload,
  AsrClientEvent,
  AsrErrorCode,
  AsrErrorPayload,
  AsrServerEvent,
  AsrStartPayload,
  AsrStopPayload,
  EmitToClient,
} from '../protocol/events';
import { AsrBackendService } from './asr-backend.service';
import { SessionManager } from './session.manager';

/**
 * 前端侧 WebSocket Gateway（与 BFF HTTP 同端口 3000）。
 * 职责：协议适配与会话入口校验，业务全部委托给 AsrBackendService。
 */
@WebSocketGateway({ cors: { origin: '*' } })
export class AsrGateway implements OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(AsrGateway.name);

  constructor(
    private readonly backendService: AsrBackendService,
    private readonly sessionManager: SessionManager,
  ) {}

  handleConnection(client: Socket): void {
    this.logger.log(`client connected: ${client.id}`);
  }

  /** 前端断连：级联关闭其全部后端会话 */
  handleDisconnect(client: Socket): void {
    this.logger.log(`client disconnected: ${client.id}`);
    this.backendService.closeByClient(client.id);
  }

  @SubscribeMessage(AsrClientEvent.Start)
  async onStart(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: AsrStartPayload,
  ): Promise<void> {
    if (!payload || typeof payload.sessionId !== 'string' || payload.sessionId.length === 0) {
      const errorPayload: AsrErrorPayload = {
        code: AsrErrorCode.InvalidState,
        message: 'asr:start requires a non-empty sessionId',
      };
      client.emit(AsrServerEvent.Error, errorPayload);
      return;
    }
    if (this.sessionManager.get(payload.sessionId)) {
      const errorPayload: AsrErrorPayload = {
        sessionId: payload.sessionId,
        code: AsrErrorCode.InvalidState,
        message: `session ${payload.sessionId} already exists`,
      };
      client.emit(AsrServerEvent.Error, errorPayload);
      return;
    }

    const emitToClient: EmitToClient = (event, data) => {
      client.emit(event, data);
    };

    try {
      await this.backendService.openSession(
        payload.sessionId,
        client.id,
        emitToClient,
        payload.mimeType,
      );
    } catch (err) {
      // 10s 内连不上后端：回 BACKEND_TIMEOUT 并确保无残留
      const errorPayload: AsrErrorPayload = {
        sessionId: payload.sessionId,
        code: AsrErrorCode.BackendTimeout,
        message: `connect ASR backend failed: ${err instanceof Error ? err.message : String(err)}`,
      };
      client.emit(AsrServerEvent.Error, errorPayload);
      this.backendService.closeSession(payload.sessionId);
    }
  }

  @SubscribeMessage(AsrClientEvent.Audio)
  onAudio(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: AsrAudioPayload,
  ): void {
    if (!this.sessionManager.get(payload.sessionId)) {
      const errorPayload: AsrErrorPayload = {
        sessionId: payload.sessionId,
        code: AsrErrorCode.SessionNotFound,
        message: `session ${payload.sessionId} not found`,
      };
      client.emit(AsrServerEvent.Error, errorPayload);
      return;
    }
    this.backendService.forwardAudio(payload.sessionId, payload);
  }

  @SubscribeMessage(AsrClientEvent.Stop)
  onStop(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: AsrStopPayload,
  ): void {
    if (!this.sessionManager.get(payload.sessionId)) {
      const errorPayload: AsrErrorPayload = {
        sessionId: payload.sessionId,
        code: AsrErrorCode.SessionNotFound,
        message: `session ${payload.sessionId} not found`,
      };
      client.emit(AsrServerEvent.Error, errorPayload);
      return;
    }
    // 透传 stop；后端回 asr:stopped 后由 AsrBackendService 负责销毁会话
    this.backendService.forwardStop(payload.sessionId, payload);
  }
}
