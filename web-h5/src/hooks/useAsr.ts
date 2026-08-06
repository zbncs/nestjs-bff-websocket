import { useCallback, useEffect, useRef, useState } from 'react';
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
export type AsrUiState =
  | 'idle'
  | 'connecting'
  | 'recording'
  | 'stopping'
  | 'error';

export interface AsrViewModel {
  state: AsrUiState;
  text: string;
  error: AsrError | null;
  start: () => Promise<void>;
  stop: () => void;
}

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

export function useAsr(): AsrViewModel {
  const socketRef = useRef<SocketService | null>(null);
  const recorderRef = useRef<AudioRecorderService | null>(null);
  if (!socketRef.current) socketRef.current = new SocketService();
  if (!recorderRef.current) recorderRef.current = new AudioRecorderService();

  const [state, setState] = useState<AsrUiState>('idle');
  const [text, setText] = useState('');
  const [error, setError] = useState<AsrError | null>(null);
  const stateRef = useRef<AsrUiState>('idle');
  const bufferedFinalsRef = useRef<string[]>([]);
  const setAsrState = useCallback((next: AsrUiState) => {
    stateRef.current = next;
    setState(next);
  }, []);

  const onResponse = useCallback(
    (response: AsrResponse): void => {
      const socket = socketRef.current!;
      const recorder = recorderRef.current!;
      if (response.code !== 0) {
        recorder.stop();
        socket.disconnect();
        setAsrState('error');
        setError({ code: response.code, message: response.msg });
        return;
      }
      if (response.data.isFinal) {
        const currentState = stateRef.current;
        if (currentState !== 'recording' && currentState !== 'stopping') return;
        if (response.data.text) bufferedFinalsRef.current.push(response.data.text);
        if (currentState === 'stopping') {
          setText(bufferedFinalsRef.current.join(''));
          setError(null);
          setAsrState('idle');
        }
      }
    },
    [setAsrState]
  );

  const onDisconnected = useCallback((): void => {
    if (stateRef.current === 'idle') return;
    recorderRef.current!.stop();
    setAsrState('error');
    setError({
      code: ClientErrorCode.WebSocketDisconnected,
      message: '与语音识别服务的连接已断开',
    });
  }, [setAsrState]);

  const start = useCallback(async (): Promise<void> => {
    const currentState = stateRef.current;
    if (
      currentState === 'connecting' ||
      currentState === 'recording' ||
      currentState === 'stopping'
    ) {
      return;
    }

    setAsrState('connecting');
    setError(null);
    setText('');
    bufferedFinalsRef.current = [];
    try {
      await socketRef.current!.connect(getWebSocketUrl(), {
        onResponse,
        onDisconnected,
        onProtocolError: (message) => {
          recorderRef.current!.stop();
          socketRef.current!.disconnect();
          setAsrState('error');
          setError({ code: ClientErrorCode.InvalidServerResponse, message });
        },
      });
      await recorderRef.current!.start(DEFAULT_SAMPLE_RATE, (chunk) => {
        if (stateRef.current === 'recording')
          socketRef.current!.sendAudio(chunk);
      });
      if (
        stateRef.current !== 'connecting' ||
        !socketRef.current!.isConnected()
      ) {
        recorderRef.current!.stop();
        return;
      }
      setAsrState('recording');
    } catch (caught) {
      recorderRef.current!.stop();
      setAsrState('error');
      setError(
        isAsrError(caught)
          ? caught
          : {
              code: ClientErrorCode.WebSocketConnectFailed,
              message: '连接语音识别服务失败',
            }
      );
    }
  }, [onDisconnected, onResponse, setAsrState]);

  const stop = useCallback((): void => {
    if (stateRef.current !== 'recording') return;
    setAsrState('stopping');
    recorderRef.current!.stop();
    socketRef.current!.sendStop();
  }, [setAsrState]);

  useEffect(() => {
    const cleanup = (): void => {
      recorderRef.current?.stop();
      socketRef.current?.disconnect();
    };
    window.addEventListener('beforeunload', cleanup);
    return () => {
      window.removeEventListener('beforeunload', cleanup);
      cleanup();
    };
  }, []);

  return { state, text, error, start, stop };
}
