import { create } from 'zustand';
import { AudioRecorderService } from '../services/audioRecorder';
import { SocketService } from '../services/socket';
import {
  ASR_STREAM_PATH,
  ClientErrorCode,
  DEFAULT_LANGUAGE,
  DEFAULT_SAMPLE_RATE,
  type AsrError,
  type AsrResponse,
} from '../types/protocol';

export const BFF_ORIGIN = 'ws://localhost:3000';
export type AsrUiState = 'idle' | 'connecting' | 'recording' | 'stopping' | 'error';

export interface AsrStore {
  state: AsrUiState;
  partialText: string;
  finals: string[];
  error: AsrError | null;
  start: () => Promise<void>;
  stop: () => void;
  onResponse: (response: AsrResponse) => void;
  onDisconnected: () => void;
}

const socketService = new SocketService();
const audioRecorder = new AudioRecorderService();

function isAsrError(error: unknown): error is AsrError {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    typeof error.code === 'number' &&
    'message' in error &&
    typeof error.message === 'string'
  );
}

function getWebSocketUrl(): string {
  const query = new URLSearchParams({
    sampleRate: String(DEFAULT_SAMPLE_RATE),
    language: DEFAULT_LANGUAGE,
  });
  return `${BFF_ORIGIN}${ASR_STREAM_PATH}?${query.toString()}`;
}

export const useAsrStore = create<AsrStore>((set, get) => ({
  state: 'idle',
  partialText: '',
  finals: [],
  error: null,

  start: async () => {
    const state = get().state;
    if (state === 'connecting' || state === 'recording' || state === 'stopping') {
      return;
    }
    set({ state: 'connecting', error: null, partialText: '' });

    try {
      await socketService.connect(getWebSocketUrl(), {
        onResponse: (response) => get().onResponse(response),
        onDisconnected: () => get().onDisconnected(),
        onProtocolError: (message) => {
          audioRecorder.stop();
          socketService.disconnect();
          set({
            state: 'error',
            error: { code: ClientErrorCode.InvalidServerResponse, message },
            partialText: '',
          });
        },
      });
      await audioRecorder.start(DEFAULT_SAMPLE_RATE, (chunk) => {
        if (get().state === 'recording') {
          socketService.sendAudio(chunk);
        }
      });
      if (get().state !== 'connecting' || !socketService.isConnected()) {
        audioRecorder.stop();
        return;
      }
      set({ state: 'recording' });
    } catch (error) {
      audioRecorder.stop();
      set({
        state: 'error',
        error: isAsrError(error)
          ? error
          : { code: ClientErrorCode.WebSocketConnectFailed, message: '连接语音识别服务失败' },
      });
    }
  },

  stop: () => {
    if (get().state !== 'recording') {
      return;
    }
    set({ state: 'stopping' });
    audioRecorder.stop();
    socketService.sendStop();
  },

  onResponse: (response) => {
    if (response.code !== 0) {
      audioRecorder.stop();
      socketService.disconnect();
      set({
        state: 'error',
        error: { code: response.code, message: response.msg },
        partialText: '',
      });
      return;
    }
    if (response.data.isFinal) {
      const finals = response.data.text ? [...get().finals, response.data.text] : get().finals;
      set({ state: 'idle', finals, partialText: '', error: null });
      return;
    }
    if (get().state === 'recording' || get().state === 'stopping') {
      set({ partialText: response.data.text });
    }
  },

  onDisconnected: () => {
    const state = get().state;
    if (state === 'idle') {
      return;
    }
    audioRecorder.stop();
    set({
      state: 'error',
      error: { code: ClientErrorCode.WebSocketDisconnected, message: '与语音识别服务的连接已断开' },
      partialText: '',
    });
  },
}));

window.addEventListener('beforeunload', () => {
  audioRecorder.stop();
  socketService.disconnect();
});
