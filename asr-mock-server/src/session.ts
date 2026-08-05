import WebSocket from 'ws';
import { PHRASES } from './phrases';

export const CHUNKS_PER_PARTIAL = 3;

interface AsrResponse {
  code: number;
  msg: string;
  data: { text: string; isFinal: boolean };
}

export class MockSession {
  private chunkCount = 0;
  private phraseIndex = 0;
  private partialText = '';
  private active = false;

  constructor(private readonly socket: WebSocket) {}

  onAudio(chunk: Buffer): void {
    if (chunk.length === 0 || chunk.length % 2 !== 0) {
      this.send(1002, 'Audio data must be 16-bit PCM bytes');
      return;
    }
    this.active = true;
    this.chunkCount += 1;
    if (this.chunkCount % CHUNKS_PER_PARTIAL !== 0) {
      return;
    }
    this.partialText += PHRASES[this.phraseIndex % PHRASES.length];
    this.phraseIndex += 1;
    this.send(0, 'success', this.partialText, false);
  }

  onControl(value: string): void {
    let action: unknown;
    try {
      const parsed: unknown = JSON.parse(value);
      action = typeof parsed === 'object' && parsed !== null && 'action' in parsed ? parsed.action : null;
    } catch {
      action = null;
    }
    if (action !== 'stop') {
      this.send(1002, 'Only the {"action":"stop"} control message is supported');
      return;
    }
    if (!this.active) {
      this.send(1003, 'No active recognition session');
      return;
    }

    const text = this.partialText || PHRASES[0];
    this.send(0, 'success', text, true);
    this.reset();
  }

  private reset(): void {
    this.chunkCount = 0;
    this.phraseIndex = 0;
    this.partialText = '';
    this.active = false;
  }

  private send(code: number, msg: string, text = '', isFinal = false): void {
    if (this.socket.readyState !== WebSocket.OPEN) {
      return;
    }
    const response: AsrResponse = { code, msg, data: { text, isFinal } };
    this.socket.send(JSON.stringify(response));
  }
}
