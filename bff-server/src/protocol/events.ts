/** Native WebSocket protocol exposed by the BFF. */
export const ASR_STREAM_PATH = '/intelligentVoice/asr/stream';

export const DEFAULT_SAMPLE_RATE = 16_000;
export const DEFAULT_LANGUAGE = 'zh-CN';

export const AsrErrorCode = {
  InvalidQuery: 1001,
  InvalidMessage: 1002,
  InvalidState: 1003,
  BackendUnavailable: 2001,
  BackendTimeout: 2002,
} as const;

export interface AsrConnectionOptions {
  sampleRate: 8_000 | 16_000;
  language: string;
}

export interface AsrControlMessage {
  action: 'stop';
}

export interface AsrResponseData {
  text: string;
  isFinal: boolean;
}

export interface AsrResponse {
  code: number;
  msg: string;
  data: AsrResponseData;
}

export function createResponse(
  code: number,
  msg: string,
  text = '',
  isFinal = false,
): AsrResponse {
  return { code, msg, data: { text, isFinal } };
}

export function parseControlMessage(value: string): AsrControlMessage | null {
  try {
    const parsed: unknown = JSON.parse(value);
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      'action' in parsed &&
      parsed.action === 'stop'
    ) {
      return { action: 'stop' };
    }
  } catch {
    // The caller maps malformed JSON to the public protocol error response.
  }
  return null;
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
