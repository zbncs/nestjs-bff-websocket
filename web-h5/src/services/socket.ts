import {
  ClientErrorCode,
  type AsrResponse,
  parseAsrResponse,
} from '../types/protocol';

export const SOCKET_CONNECT_TIMEOUT_MS = 5_000;

export interface SocketHandlers {
  onResponse: (response: AsrResponse) => void;
  onDisconnected: () => void;
  onProtocolError: (message: string) => void;
}

/** Browser-facing native WebSocket transport. */
export class SocketService {
  private socket: WebSocket | null = null;
  private handlers: SocketHandlers | null = null;

  connect(url: string, handlers: SocketHandlers): Promise<void> {
    this.handlers = handlers;
    if (this.socket?.readyState === WebSocket.OPEN) {
      return Promise.resolve();
    }
    this.disconnect();

    return new Promise<void>((resolve, reject) => {
      const socket = new WebSocket(url);
      socket.binaryType = 'arraybuffer';
      this.socket = socket;
      let settled = false;

      const timer = setTimeout(() => {
        if (!settled) {
          settled = true;
          socket.close();
          reject(new Error(String(ClientErrorCode.WebSocketConnectFailed)));
        }
      }, SOCKET_CONNECT_TIMEOUT_MS);

      socket.onopen = () => {
        if (settled) {
          return;
        }
        settled = true;
        clearTimeout(timer);
        resolve();
      };
      socket.onmessage = (event: MessageEvent<unknown>) => {
        if (typeof event.data !== 'string') {
          this.handlers?.onProtocolError('服务端返回了非文本响应');
          return;
        }
        const response = parseAsrResponse(event.data);
        if (!response) {
          this.handlers?.onProtocolError(
            '服务端返回的 JSON 结构不符合接口文档'
          );
          return;
        }
        this.handlers?.onResponse(response);
      };
      socket.onerror = () => {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          reject(new Error(String(ClientErrorCode.WebSocketConnectFailed)));
        }
      };
      socket.onclose = () => {
        clearTimeout(timer);
        if (this.socket === socket) {
          this.socket = null;
          this.handlers?.onDisconnected();
        }
      };
    });
  }

  sendAudio(chunk: ArrayBuffer): void {
    if (this.socket?.readyState === WebSocket.OPEN) {
      this.socket.send(chunk);
    }
  }

  sendStop(): void {
    if (this.socket?.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify({ action: 'stop' }));
    }
  }

  isConnected(): boolean {
    return this.socket?.readyState === WebSocket.OPEN;
  }

  disconnect(): void {
    const socket = this.socket;
    this.socket = null;
    if (socket && socket.readyState !== WebSocket.CLOSED) {
      socket.close(1000, 'page closed');
    }
  }
}
