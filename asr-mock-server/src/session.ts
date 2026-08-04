import type { Socket } from 'socket.io';
import { PHRASES } from './phrases';

/**
 * Mock 侧协议常量与 payload 类型。
 * 与 bff-server/src/protocol/events.ts 语义保持一致（Mock 按设计不共享文件，
 * 仅保留同步注释；事件名一律使用常量，禁止字面量散落）。
 */
export const AsrClientEvent = {
  Start: 'asr:start',
  Audio: 'asr:audio',
  Stop: 'asr:stop',
} as const;

export const AsrServerEvent = {
  Started: 'asr:started',
  Partial: 'asr:partial',
  Final: 'asr:final',
  Error: 'asr:error',
  Stopped: 'asr:stopped',
} as const;

export interface AsrStartPayload {
  sessionId: string;
  mimeType?: string;
}

export interface AsrAudioPayload {
  sessionId: string;
  seq: number;
  chunk: string;
  timestamp: number;
}

export interface AsrStopPayload {
  sessionId: string;
}

/** 每累计多少个音频分片产出 1 条 partial（共享约定第 8 条） */
export const CHUNKS_PER_PARTIAL = 3;

/**
 * 单个连接的 Mock 识别会话。
 * 每条到 Mock 的 socket.io 连接对应一次前端录音会话（BFF 每会话独立连接）。
 * 音频 chunk 为 Base64 纯透传，Mock 不解码、不落地，仅按分片计数产出结果。
 */
export class MockSession {
  /** 已收到的音频分片数 */
  private chunkCount = 0;
  /** 下一句待输出文案在 PHRASES 中的下标 */
  private phraseIndex = 0;
  /** partial 自增序号（1,2,3…），与音频分片 seq 无关 */
  private partialSeq = 0;
  /** 已产出 partial 文案的累计汇总（stop 时作为 final 返回） */
  private finalText = '';

  constructor(private readonly socket: Socket) {}

  /** asr:start：回 asr:started 表示后端就绪 */
  onStart(payload: AsrStartPayload): void {
    this.socket.emit(AsrServerEvent.Started, { sessionId: payload.sessionId });
  }

  /** asr:audio：每累计 3 片回 1 条 partial，按序取句作为增量 */
  onAudio(payload: AsrAudioPayload): void {
    this.chunkCount += 1;
    if (this.chunkCount % CHUNKS_PER_PARTIAL !== 0) {
      return;
    }
    const text = PHRASES[this.phraseIndex % PHRASES.length];
    this.phraseIndex += 1;
    this.partialSeq += 1;
    this.finalText += text;
    this.socket.emit(AsrServerEvent.Partial, {
      sessionId: payload.sessionId,
      seq: this.partialSeq,
      text,
    });
  }

  /** asr:stop：回 asr:final 汇总 + asr:stopped */
  onStop(payload: AsrStopPayload): void {
    const text =
      this.finalText.length > 0
        ? this.finalText
        : this.chunkCount > 0
          ? PHRASES[0]
          : '（未识别到有效语音）';
    this.socket.emit(AsrServerEvent.Final, { sessionId: payload.sessionId, text });
    this.socket.emit(AsrServerEvent.Stopped, { sessionId: payload.sessionId });
  }
}
