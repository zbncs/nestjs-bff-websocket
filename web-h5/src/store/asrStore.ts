import { create } from 'zustand';
import { AudioRecorderService } from '../services/audioRecorder';
import { SocketService } from '../services/socket';
import {
  AsrErrorCode,
  AsrErrorPayload,
  AsrFinalPayload,
  AsrPartialPayload,
  AsrServerEvent,
  AsrStartedPayload,
  AsrStoppedPayload,
} from '../types/protocol';

/** 前端 connecting 看门狗超时（共享约定第 5 条） */
export const START_TIMEOUT_MS = 5000;

/** BFF 地址（socket.io 直连，无需 vite proxy） */
export const BFF_URL = 'http://localhost:3000';

/** 前端状态机：idle → connecting → recording → stopping → idle/error */
export type AsrUiState = 'idle' | 'connecting' | 'recording' | 'stopping' | 'error';

export interface AsrStore {
  state: AsrUiState;
  sessionId: string | null;
  partialText: string;
  finals: string[];
  error: AsrErrorPayload | null;

  start: () => Promise<void>;
  stop: () => Promise<void>;
  onStarted: (payload: AsrStartedPayload) => void;
  onPartial: (payload: AsrPartialPayload) => void;
  onFinal: (payload: AsrFinalPayload) => void;
  onStopped: (payload: AsrStoppedPayload) => void;
  onError: (payload: AsrErrorPayload) => void;
  onDisconnected: () => void;
}

// 模块级单例：一次会话一条 socket 连接、一个录音器实例
const socketService = new SocketService();
const audioRecorder = new AudioRecorderService();

let startWatchdog: ReturnType<typeof setTimeout> | null = null;

function clearWatchdog(): void {
  if (startWatchdog !== null) {
    clearTimeout(startWatchdog);
    startWatchdog = null;
  }
}

function isAsrErrorPayload(err: unknown): err is AsrErrorPayload {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    typeof (err as { code: unknown }).code === 'string'
  );
}

export const useAsrStore = create<AsrStore>((set, get) => ({
  state: 'idle',
  sessionId: null,
  partialText: '',
  finals: [],
  error: null,

  start: async () => {
    const current = get().state;
    if (current === 'connecting' || current === 'recording' || current === 'stopping') {
      return;
    }

    const sessionId = crypto.randomUUID();
    set({ state: 'connecting', sessionId, error: null, partialText: '' });

    // 5s 看门狗：未收到 asr:started 则 START_TIMEOUT
    startWatchdog = setTimeout(() => {
      get().onError({
        sessionId,
        code: AsrErrorCode.StartTimeout,
        message: `${START_TIMEOUT_MS}ms 内未收到 asr:started`,
      });
    }, START_TIMEOUT_MS);

    try {
      // ① 先申请麦克风并启动分片采集（started 前产生的分片不上送）
      const mimeType = await audioRecorder.start((base64, seq) => {
        const s = get();
        if (s.state === 'recording' && s.sessionId) {
          socketService.emitAudio({
            sessionId: s.sessionId,
            seq,
            chunk: base64,
            timestamp: Date.now(),
          });
        }
      });

      // ② 连接 BFF（5s 超时）并接线服务端事件
      await socketService.connect(BFF_URL);
      socketService.on<AsrStartedPayload>(AsrServerEvent.Started, (p) => get().onStarted(p));
      socketService.on<AsrPartialPayload>(AsrServerEvent.Partial, (p) => get().onPartial(p));
      socketService.on<AsrFinalPayload>(AsrServerEvent.Final, (p) => get().onFinal(p));
      socketService.on<AsrStoppedPayload>(AsrServerEvent.Stopped, (p) => get().onStopped(p));
      socketService.on<AsrErrorPayload>(AsrServerEvent.Error, (p) => get().onError(p));
      socketService.on<string>('disconnect', () => get().onDisconnected());

      // ③ 发起会话
      socketService.emitStart({ sessionId, mimeType });
    } catch (err) {
      if (isAsrErrorPayload(err)) {
        get().onError({ ...err, sessionId });
      } else {
        get().onError({
          sessionId,
          code: AsrErrorCode.WsConnectFailed,
          message: `连接 BFF 失败：${err instanceof Error ? err.message : String(err)}`,
        });
      }
    }
  },

  stop: async () => {
    const { state, sessionId } = get();
    if (state !== 'recording' || !sessionId) {
      return;
    }
    set({ state: 'stopping' });
    audioRecorder.stop();
    socketService.emitStop({ sessionId });
    // 回到 idle 由 onStopped / onError / onDisconnected 驱动
  },

  onStarted: (payload) => {
    const { state, sessionId } = get();
    if (state !== 'connecting' || payload.sessionId !== sessionId) {
      return;
    }
    clearWatchdog();
    set({ state: 'recording' });
  },

  onPartial: (payload) => {
    const { state, sessionId } = get();
    if ((state === 'recording' || state === 'stopping') && payload.sessionId === sessionId) {
      set({ partialText: payload.text });
    }
  },

  onFinal: (payload) => {
    const { sessionId, finals } = get();
    if (payload.sessionId !== sessionId) {
      return;
    }
    set({ finals: [...finals, payload.text], partialText: '' });
  },

  onStopped: (payload) => {
    const { sessionId } = get();
    if (payload.sessionId && payload.sessionId !== sessionId) {
      return;
    }
    clearWatchdog();
    set({ state: 'idle', sessionId: null, partialText: '' });
    socketService.disconnect();
  },

  onError: (payload) => {
    clearWatchdog();
    audioRecorder.stop();
    const { sessionId } = get();
    // 尽力通知后端清理（START_TIMEOUT 场景），随后断开连接
    if (sessionId && socketService.isConnected()) {
      socketService.emitStop({ sessionId });
    }
    set({ state: 'error', error: payload, partialText: '' });
    socketService.disconnect();
  },

  onDisconnected: () => {
    const { state, sessionId } = get();
    if (state === 'connecting' || state === 'recording' || state === 'stopping') {
      get().onError({
        sessionId: sessionId ?? undefined,
        code: AsrErrorCode.WsDisconnected,
        message: '与 BFF 的连接已断开',
      });
    }
  },
}));
