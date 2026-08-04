import { Injectable } from '@nestjs/common';
import type { Socket } from 'socket.io-client';

/**
 * 一条后端会话：每个 sessionId 独占一条到 Mock 后端的 socket.io 连接。
 * backendSocket 在连接建立成功后由 AsrBackendService 赋值。
 */
export interface BackendSession {
  sessionId: string;
  clientSocketId: string;
  backendSocket: Socket | null;
  createdAt: number;
}

/**
 * 会话路由表：Map<sessionId, BackendSession>。
 * 支持多前端并发，会话之间互不串话。
 */
@Injectable()
export class SessionManager {
  private readonly sessions = new Map<string, BackendSession>();

  /** 创建会话路由项（backendSocket 稍后由调用方赋值） */
  create(sessionId: string, clientSocketId: string): BackendSession {
    const session: BackendSession = {
      sessionId,
      clientSocketId,
      backendSocket: null,
      createdAt: Date.now(),
    };
    this.sessions.set(sessionId, session);
    return session;
  }

  get(sessionId: string): BackendSession | undefined {
    return this.sessions.get(sessionId);
  }

  remove(sessionId: string): void {
    this.sessions.delete(sessionId);
  }

  /** 按前端 socket id 反查其持有的全部会话（前端断连清理用） */
  findByClient(clientSocketId: string): BackendSession[] {
    return [...this.sessions.values()].filter((s) => s.clientSocketId === clientSocketId);
  }
}
