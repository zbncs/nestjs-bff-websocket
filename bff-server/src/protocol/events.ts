/**
 * ASR 实时转写消息协议定义。
 *
 * 注意：本文件与 web-h5/src/types/protocol.ts 内容必须保持一致，
 * 修改任一份时需同步另一份（共享约定第 6 条）。
 *
 * 事件名一律使用本文件导出的常量，禁止散落字符串字面量。
 */

/** 客户端 → 服务端 事件名常量 */
export const AsrClientEvent = {
  Start: 'asr:start',
  Audio: 'asr:audio',
  Stop: 'asr:stop',
} as const;
export type AsrClientEventType = (typeof AsrClientEvent)[keyof typeof AsrClientEvent];

/** 服务端 → 客户端 事件名常量 */
export const AsrServerEvent = {
  Started: 'asr:started',
  Partial: 'asr:partial',
  Final: 'asr:final',
  Error: 'asr:error',
  Stopped: 'asr:stopped',
} as const;
export type AsrServerEventType = (typeof AsrServerEvent)[keyof typeof AsrServerEvent];

/** 统一错误码枚举（前后端共用语义） */
export enum AsrErrorCode {
  MicDenied = 'MIC_DENIED',
  MicNotFound = 'MIC_NOT_FOUND',
  WsConnectFailed = 'WS_CONNECT_FAILED',
  WsDisconnected = 'WS_DISCONNECTED',
  BackendUnavailable = 'BACKEND_UNAVAILABLE',
  BackendTimeout = 'BACKEND_TIMEOUT',
  SessionNotFound = 'SESSION_NOT_FOUND',
  StartTimeout = 'START_TIMEOUT',
  InvalidState = 'INVALID_STATE',
}

/** asr:start（C→S）：开启一次转写会话，sessionId 由前端 crypto.randomUUID() 生成 */
export interface AsrStartPayload {
  sessionId: string;
  mimeType?: string;
}

/** asr:audio（C→S）：音频分片，chunk 为 Base64 字符串，纯透传不解码 */
export interface AsrAudioPayload {
  sessionId: string;
  seq: number;
  chunk: string;
  timestamp: number;
}

/** asr:stop（C→S）：停止会话 */
export interface AsrStopPayload {
  sessionId: string;
}

/** asr:started（S→C）：后端就绪，可以开始推送音频 */
export interface AsrStartedPayload {
  sessionId: string;
}

/** asr:partial（S→C）：实时增量识别结果，seq 由识别侧自增（1,2,3…） */
export interface AsrPartialPayload {
  sessionId: string;
  seq: number;
  text: string;
}

/** asr:final（S→C）：停止后的汇总识别结果 */
export interface AsrFinalPayload {
  sessionId: string;
  text: string;
}

/** asr:error（S→C）：统一错误格式；sessionId 可选（连接级错误时可能不存在） */
export interface AsrErrorPayload {
  sessionId?: string;
  code: AsrErrorCode;
  message: string;
}

/** asr:stopped（S→C）：后端确认会话已停止并清理完毕 */
export interface AsrStoppedPayload {
  sessionId?: string;
}

/** 服务端回发事件的 payload 联合类型 */
export type AsrServerPayload =
  | AsrStartedPayload
  | AsrPartialPayload
  | AsrFinalPayload
  | AsrErrorPayload
  | AsrStoppedPayload;

/** 向某个前端连接回发事件的回调签名（BFF 内部使用） */
export type EmitToClient = (event: AsrServerEventType, payload: AsrServerPayload) => void;
