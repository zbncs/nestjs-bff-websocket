import { io, Socket } from 'socket.io-client';
import {
  AsrAudioPayload,
  AsrClientEvent,
  AsrStartPayload,
  AsrStopPayload,
} from '../types/protocol';

/** 前端 socket 连接超时（共享约定第 5 条） */
export const SOCKET_CONNECT_TIMEOUT_MS = 5000;

/**
 * socket.io-client 封装：连接管理 + 协议事件收发。
 * 每次 connect 新建 socket 实例，保证事件监听不残留、不重复。
 */
export class SocketService {
  private socket: Socket | null = null;

  /**
   * 建立连接（5s 超时）。
   * @throws Error('WS_CONNECT_FAILED') 超时或 connect_error
   */
  connect(url: string): Promise<void> {
    this.disconnect();
    return new Promise<void>((resolve, reject) => {
      const socket = io(url, {
        reconnection: false,
        timeout: SOCKET_CONNECT_TIMEOUT_MS,
      });
      this.socket = socket;

      const timer = setTimeout(() => {
        socket.disconnect();
        reject(new Error('WS_CONNECT_FAILED'));
      }, SOCKET_CONNECT_TIMEOUT_MS);

      socket.once('connect', () => {
        clearTimeout(timer);
        resolve();
      });
      socket.once('connect_error', (err: Error) => {
        clearTimeout(timer);
        socket.disconnect();
        reject(new Error(`WS_CONNECT_FAILED: ${err.message}`));
      });
    });
  }

  /** 订阅事件（asr:* 协议事件或 socket.io 内建事件如 disconnect） */
  on<T>(event: string, handler: (payload: T) => void): void {
    this.socket?.on(event, handler as (payload: unknown) => void);
  }

  emitStart(payload: AsrStartPayload): void {
    this.socket?.emit(AsrClientEvent.Start, payload);
  }

  emitAudio(payload: AsrAudioPayload): void {
    this.socket?.emit(AsrClientEvent.Audio, payload);
  }

  emitStop(payload: AsrStopPayload): void {
    this.socket?.emit(AsrClientEvent.Stop, payload);
  }

  isConnected(): boolean {
    return this.socket?.connected ?? false;
  }

  disconnect(): void {
    if (this.socket) {
      this.socket.removeAllListeners();
      this.socket.disconnect();
      this.socket = null;
    }
  }
}
