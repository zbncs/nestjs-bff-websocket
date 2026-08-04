import { Server } from 'socket.io';
import {
  AsrClientEvent,
  AsrAudioPayload,
  AsrStartPayload,
  AsrStopPayload,
  MockSession,
} from './session';

/** Mock ASR 后端固定端口（共享约定第 7 条） */
const PORT = 3001;

const io = new Server(PORT, {
  cors: { origin: '*' },
});

io.on('connection', (socket) => {
  console.log(`[mock] client connected: ${socket.id}`);
  const session = new MockSession(socket);

  socket.on(AsrClientEvent.Start, (payload: AsrStartPayload) => {
    console.log(`[mock] asr:start session=${payload.sessionId} mime=${payload.mimeType ?? 'n/a'}`);
    session.onStart(payload);
  });

  socket.on(AsrClientEvent.Audio, (payload: AsrAudioPayload) => {
    session.onAudio(payload);
  });

  socket.on(AsrClientEvent.Stop, (payload: AsrStopPayload) => {
    console.log(`[mock] asr:stop session=${payload.sessionId}`);
    session.onStop(payload);
  });

  socket.on('disconnect', (reason: string) => {
    console.log(`[mock] client disconnected: ${socket.id} (${reason})`);
  });
});

console.log(`[mock] asr-mock-server listening on http://localhost:${PORT}`);
