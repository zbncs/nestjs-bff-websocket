import { type RawData, WebSocketServer } from 'ws';
import { MockSession } from './session';

const PORT = 3001;
const ASR_STREAM_PATH = '/intelligentVoice/asr/stream';
const IDLE_TIMEOUT_MS = 60_000;

const server = new WebSocketServer({ port: PORT, path: ASR_STREAM_PATH });

server.on('connection', (socket, request) => {
  const url = new URL(request.url ?? ASR_STREAM_PATH, 'http://localhost');
  const sampleRateValue = url.searchParams.get('sampleRate');
  const sampleRate = sampleRateValue === null ? 16_000 : Number(sampleRateValue);
  const language = url.searchParams.get('language') ?? 'zh-CN';
  if ((sampleRate !== 8_000 && sampleRate !== 16_000) || language.trim().length === 0) {
    socket.send(JSON.stringify({
      code: 1001,
      msg: 'Invalid connection query parameters',
      data: { text: '', isFinal: false },
    }));
    socket.close(1008, 'invalid query parameters');
    return;
  }

  const session = new MockSession(socket);
  let idleTimer: ReturnType<typeof setTimeout>;
  const refreshIdleTimer = (): void => {
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => socket.close(1000, 'idle timeout'), IDLE_TIMEOUT_MS);
  };

  refreshIdleTimer();
  console.log(`[mock] client connected: ${request.socket.remoteAddress ?? 'unknown'}`);

  socket.on('message', (data, isBinary) => {
    refreshIdleTimer();
    if (isBinary) {
      session.onAudio(rawDataToBuffer(data));
    } else {
      session.onControl(data.toString());
    }
  });
  socket.on('close', () => {
    clearTimeout(idleTimer);
    console.log('[mock] client disconnected');
  });
  socket.on('error', (error: Error) => {
    console.error(`[mock] WebSocket error: ${error.message}`);
  });
});

console.log(`[mock] WebSocket listening on ws://localhost:${PORT}${ASR_STREAM_PATH}`);

function rawDataToBuffer(data: RawData): Buffer {
  if (Array.isArray(data)) {
    return Buffer.concat(data);
  }
  return Buffer.isBuffer(data) ? data : Buffer.from(data);
}
