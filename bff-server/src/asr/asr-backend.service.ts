import { Injectable, Logger } from '@nestjs/common';
import { io, Socket } from 'socket.io-client';
import { BACKEND_CONNECT_TIMEOUT_MS, BACKEND_URL } from '../config';
import {
  AsrAudioPayload,
  AsrClientEvent,
  AsrErrorCode,
  AsrErrorPayload,
  AsrFinalPayload,
  AsrPartialPayload,
  AsrServerEvent,
  AsrStartPayload,
  AsrStartedPayload,
  AsrStopPayload,
  AsrStoppedPayload,
  EmitToClient,
} from '../protocol/events';
import { SessionManager } from './session.manager';

/**
 * 管理 BFF → ASR Mock 后端的 socket.io-client 连接。
 * 每个 sessionId 独立一条连接，收到后端事件后按 sessionId 路由回对应前端。
 */
@Injectable()
export class AsrBackendService {
  private readonly logger = new Logger(AsrBackendService.name);

  constructor(private readonly sessionManager: SessionManager) {}

  /**
   * 开启一条后端会话：建立到 Mock 的连接（10s 超时），
   * 接线事件转发后向后端发送 asr:start。
   *
   * @param sessionId     前端生成的会话 id
   * @param clientSocketId 前端 socket id（级联清理用）
   * @param emitToClient  向该前端连接回发事件的回调
   * @param mimeType      前端 MediaRecorder 实际使用的音频编码（可选透传）
   * @throws 连接超时或 connect_error 时 reject（由 Gateway 映射为 BACKEND_TIMEOUT）
   */
  async openSession(
    sessionId: string,
    clientSocketId: string,
    emitToClient: EmitToClient,
    mimeType?: string,
  ): Promise<void> {
    const backendSocket: Socket = io(BACKEND_URL, {
      reconnection: false,
      timeout: BACKEND_CONNECT_TIMEOUT_MS,
    });

    // 10s 连接超时看门狗：超时 / connect_error 均视为后端不可用
    try {
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => {
          reject(new Error(`backend connect timeout (${BACKEND_CONNECT_TIMEOUT_MS}ms)`));
        }, BACKEND_CONNECT_TIMEOUT_MS);
        backendSocket.once('connect', () => {
          clearTimeout(timer);
          resolve();
        });
        backendSocket.once('connect_error', (err: Error) => {
          clearTimeout(timer);
          reject(err);
        });
      });
    } catch (err) {
      backendSocket.disconnect();
      throw err;
    }

    const session = this.sessionManager.create(sessionId, clientSocketId);
    session.backendSocket = backendSocket;
    this.logger.log(`backend session opened: ${sessionId} (client=${clientSocketId})`);

    // 后端事件 → 按 sessionId 路由回对应前端
    backendSocket.on(AsrServerEvent.Started, (p: AsrStartedPayload) => {
      emitToClient(AsrServerEvent.Started, p);
    });
    backendSocket.on(AsrServerEvent.Partial, (p: AsrPartialPayload) => {
      emitToClient(AsrServerEvent.Partial, p);
    });
    backendSocket.on(AsrServerEvent.Final, (p: AsrFinalPayload) => {
      emitToClient(AsrServerEvent.Final, p);
    });
    backendSocket.on(AsrServerEvent.Error, (p: AsrErrorPayload) => {
      emitToClient(AsrServerEvent.Error, p);
    });
    backendSocket.on(AsrServerEvent.Stopped, (p: AsrStoppedPayload) => {
      emitToClient(AsrServerEvent.Stopped, p);
      // 后端确认停止后即销毁本会话的后端连接与路由项
      this.closeSession(sessionId);
    });

    // 级联断连：后端 socket 断开时，若会话仍在路由表中（非主动销毁），
    // 通知前端 BACKEND_UNAVAILABLE 并销毁会话
    backendSocket.on('disconnect', (reason: string) => {
      if (this.sessionManager.get(sessionId)) {
        this.logger.warn(`backend disconnected unexpectedly: ${sessionId} (${reason})`);
        const errorPayload: AsrErrorPayload = {
          sessionId,
          code: AsrErrorCode.BackendUnavailable,
          message: `ASR backend unavailable (${reason})`,
        };
        emitToClient(AsrServerEvent.Error, errorPayload);
        this.closeSession(sessionId);
      }
    });

    // 通知后端开启识别会话
    const startPayload: AsrStartPayload = { sessionId, mimeType };
    backendSocket.emit(AsrClientEvent.Start, startPayload);
  }

  /** 透传音频分片到对应后端连接（chunk 为 Base64，不解码不落地） */
  forwardAudio(sessionId: string, payload: AsrAudioPayload): void {
    this.sessionManager.get(sessionId)?.backendSocket?.emit(AsrClientEvent.Audio, payload);
  }

  /** 透传停止指令到对应后端连接（设计上 Gateway 委托的 stop 转发，补充方法） */
  forwardStop(sessionId: string, payload: AsrStopPayload): void {
    this.sessionManager.get(sessionId)?.backendSocket?.emit(AsrClientEvent.Stop, payload);
  }

  /** 销毁会话：先从路由表摘除（防 disconnect 回调重复通知），再断开后端连接 */
  closeSession(sessionId: string): void {
    const session = this.sessionManager.get(sessionId);
    if (!session) {
      return;
    }
    this.sessionManager.remove(sessionId);
    session.backendSocket?.disconnect();
    this.logger.log(`backend session closed: ${sessionId}`);
  }

  /** 前端断连级联清理：关闭该前端持有的全部后端会话 */
  closeByClient(clientSocketId: string): void {
    const sessions = this.sessionManager.findByClient(clientSocketId);
    for (const session of sessions) {
      this.closeSession(session.sessionId);
    }
  }
}
