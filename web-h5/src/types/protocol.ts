export const ASR_STREAM_PATH = '/intelligentVoice/asr/stream';
export const DEFAULT_SAMPLE_RATE = 16_000;
export const DEFAULT_LANGUAGE = 'zh-CN';

export const ClientErrorCode = {
  MicDenied: 3001,
  MicNotFound: 3002,
  WebSocketConnectFailed: 3003,
  WebSocketDisconnected: 3004,
  InvalidServerResponse: 3005,
} as const;

export interface AsrResponseData {
  text: string;
  isFinal: boolean;
}

export interface AsrResponse {
  code: number;
  msg: string;
  data: AsrResponseData;
}

export interface AsrError {
  code: number;
  message: string;
}

export function parseAsrResponse(value: string): AsrResponse | null {
  try {
    const parsed: unknown = JSON.parse(value);
    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      !('code' in parsed) ||
      typeof parsed.code !== 'number' ||
      !('msg' in parsed) ||
      typeof parsed.msg !== 'string' ||
      !('data' in parsed) ||
      typeof parsed.data !== 'object' ||
      parsed.data === null ||
      !('text' in parsed.data) ||
      typeof parsed.data.text !== 'string' ||
      !('isFinal' in parsed.data) ||
      typeof parsed.data.isFinal !== 'boolean'
    ) {
      return null;
    }
    return {
      code: parsed.code,
      msg: parsed.msg,
      data: { text: parsed.data.text, isFinal: parsed.data.isFinal },
    };
  } catch {
    return null;
  }
}
