import WebSocket from 'ws';
import { PHRASES } from './phrases';

export const CHUNKS_PER_SENTENCE = 3;

interface AsrResponse {
  code: number;
  msg: string;
  data: { text: string; isFinal: boolean };
}

export class MockSession {
  private sentenceChunkCount = 0;
  private phraseIndex = 0;
  private active = false;

  constructor(private readonly socket: WebSocket) {}

  onAudio(chunk: Buffer): void {
    if (chunk.length === 0 || chunk.length % 2 !== 0) {
      this.send(1002, 'Audio data must be 16-bit PCM bytes');
      return;
    }
    this.active = true;
    this.sentenceChunkCount += 1;
    const sentence = PHRASES[this.phraseIndex % PHRASES.length];

    if (this.sentenceChunkCount < CHUNKS_PER_SENTENCE) {
      this.send(0, 'success', this.getPartialText(sentence), false);
      return;
    }

    this.send(0, 'success', sentence, true);
    this.sentenceChunkCount = 0;
    this.phraseIndex += 1;
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

    const text =
      this.sentenceChunkCount > 0 ? PHRASES[this.phraseIndex % PHRASES.length] : '';
    this.send(0, 'success', text, true);
    this.reset();
  }

  private reset(): void {
    this.sentenceChunkCount = 0;
    this.phraseIndex = 0;
    this.active = false;
  }

  private getPartialText(sentence: string): string {
    const characters = Array.from(sentence);
    const length = Math.ceil(
      (characters.length * this.sentenceChunkCount) / CHUNKS_PER_SENTENCE,
    );
    return characters.slice(0, length).join('');
  }

  private send(code: number, msg: string, text = '', isFinal = false): void {
    if (this.socket.readyState !== WebSocket.OPEN) {
      return;
    }
    const response: AsrResponse = { code, msg, data: { text, isFinal } };
    this.socket.send(JSON.stringify(response));
  }
}
