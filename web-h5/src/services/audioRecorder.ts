import { AsrErrorCode, AsrErrorPayload } from '../types/protocol';

/** MediaRecorder 分片间隔（共享约定第 8 条） */
export const AUDIO_TIMESLICE_MS = 250;

/** 优先使用的音频编码（Chromium 系支持最好） */
const PREFERRED_MIME_TYPE = 'audio/webm;codecs=opus';

/**
 * MediaRecorder 分片采集：Blob → ArrayBuffer → Base64。
 * 权限拒绝抛 MIC_DENIED，无设备抛 MIC_NOT_FOUND（均为 AsrErrorPayload 结构）。
 */
export class AudioRecorderService {
  private recorder: MediaRecorder | null = null;
  private stream: MediaStream | null = null;
  private seq = 0;

  /**
   * 申请麦克风并开始分片采集。
   * @param onChunk 每 250ms 回调一次（base64, seq），seq 从 1 自增
   * @returns 实际使用的 mimeType（随 asr:start 透传给后端）
   * @throws AsrErrorPayload（MIC_DENIED / MIC_NOT_FOUND）
   */
  async start(onChunk: (base64: string, seq: number) => void): Promise<string> {
    if (!navigator.mediaDevices?.getUserMedia) {
      const error: AsrErrorPayload = {
        code: AsrErrorCode.MicNotFound,
        message: '当前浏览器不支持麦克风采集',
      };
      throw error;
    }

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (err) {
      const name = err instanceof DOMException ? err.name : '';
      const error: AsrErrorPayload =
        name === 'NotFoundError' || name === 'OverconstrainedError'
          ? { code: AsrErrorCode.MicNotFound, message: '未检测到可用的麦克风设备' }
          : { code: AsrErrorCode.MicDenied, message: '麦克风权限被拒绝，请在浏览器设置中授权' };
      throw error;
    }
    this.stream = stream;

    const recorder = MediaRecorder.isTypeSupported(PREFERRED_MIME_TYPE)
      ? new MediaRecorder(stream, { mimeType: PREFERRED_MIME_TYPE })
      : new MediaRecorder(stream);
    this.recorder = recorder;
    this.seq = 0;

    recorder.ondataavailable = (event: BlobEvent) => {
      if (event.data.size === 0) {
        return;
      }
      this.seq += 1;
      const seq = this.seq;
      void event.data
        .arrayBuffer()
        .then((buffer) => onChunk(arrayBufferToBase64(buffer), seq))
        .catch((err: unknown) => {
          console.error('[audioRecorder] chunk encode failed:', err);
        });
    };

    recorder.start(AUDIO_TIMESLICE_MS);
    return recorder.mimeType;
  }

  /** 停止采集并释放麦克风 */
  stop(): void {
    if (this.recorder && this.recorder.state !== 'inactive') {
      this.recorder.stop();
    }
    this.recorder = null;
    if (this.stream) {
      for (const track of this.stream.getTracks()) {
        track.stop();
      }
      this.stream = null;
    }
  }
}

/** ArrayBuffer → Base64（分块转换，避免大 buffer 展开参数栈溢出） */
function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  const CHUNK_SIZE = 0x8000;
  let binary = '';
  for (let i = 0; i < bytes.length; i += CHUNK_SIZE) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK_SIZE));
  }
  return btoa(binary);
}
