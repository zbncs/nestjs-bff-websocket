/**
 * BFF 全局常量配置（共享约定第 5、7 条：超时不硬编码进逻辑，端口固定）。
 */

/** BFF 监听端口（HTTP + WS 同端口） */
export const BFF_PORT = 3000;

/** ASR Mock 后端地址 */
export const BACKEND_URL = 'http://localhost:3001';

/** BFF 等待后端 socket 连接建立的超时时间（ms），超时回 BACKEND_TIMEOUT */
export const BACKEND_CONNECT_TIMEOUT_MS = 10_000;
