import { ClientErrorCode, type AsrError } from '../types/protocol';

export const AUDIO_CHUNK_BYTES = 3_200;

/** Captures mono audio and emits raw PCM 16-bit little-endian chunks. */
export class AudioRecorderService {
  private stream: MediaStream | null = null;
  private audioContext: AudioContext | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private processor: ScriptProcessorNode | null = null;
  private silentGain: GainNode | null = null;

  async start(
    sampleRate: number,
    onChunk: (chunk: ArrayBuffer) => void
  ): Promise<void> {
    this.stop();
    if (!navigator.mediaDevices?.getUserMedia) {
      throw this.error(
        ClientErrorCode.MicNotFound,
        '当前浏览器不支持麦克风采集'
      );
    }

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          sampleRate,
          echoCancellation: false,
          noiseSuppression: false,
        },
      });
    } catch (err) {
      const name = err instanceof DOMException ? err.name : '';
      if (name === 'NotFoundError' || name === 'OverconstrainedError') {
        throw this.error(
          ClientErrorCode.MicNotFound,
          '未检测到可用的麦克风设备'
        );
      }
      throw this.error(
        ClientErrorCode.MicDenied,
        '麦克风权限被拒绝，请在浏览器设置中授权'
      );
    }

    const context = new AudioContext({ sampleRate });
    const source = context.createMediaStreamSource(stream);
    const processor = context.createScriptProcessor(2_048, 1, 1);
    const silentGain = context.createGain();
    silentGain.gain.value = 0;
    const encoder = new PcmChunkEncoder(
      context.sampleRate,
      sampleRate,
      AUDIO_CHUNK_BYTES / 2
    );

    processor.onaudioprocess = (event: AudioProcessingEvent) => {
      const input = event.inputBuffer.getChannelData(0);
      for (const chunk of encoder.push(input)) {
        onChunk(chunk);
      }
    };
    source.connect(processor);
    processor.connect(silentGain);
    silentGain.connect(context.destination);

    this.stream = stream;
    this.audioContext = context;
    this.source = source;
    this.processor = processor;
    this.silentGain = silentGain;
    await context.resume();
  }

  stop(): void {
    if (this.processor) {
      this.processor.onaudioprocess = null;
      this.processor.disconnect();
      this.processor = null;
    }
    this.source?.disconnect();
    this.source = null;
    this.silentGain?.disconnect();
    this.silentGain = null;
    if (this.audioContext) {
      void this.audioContext.close();
      this.audioContext = null;
    }
    if (this.stream) {
      for (const track of this.stream.getTracks()) {
        track.stop();
      }
      this.stream = null;
    }
  }

  private error(code: number, message: string): AsrError {
    return { code, message };
  }
}

class PcmChunkEncoder {
  private readonly inputSamples: number[] = [];
  private readonly pcmSamples: number[] = [];
  private inputPosition = 0;

  constructor(
    private readonly inputSampleRate: number,
    private readonly outputSampleRate: number,
    private readonly chunkSamples: number
  ) {}

  push(input: Float32Array): ArrayBuffer[] {
    for (const sample of input) {
      this.inputSamples.push(sample);
    }

    const ratio = this.inputSampleRate / this.outputSampleRate;
    while (this.inputPosition + ratio <= this.inputSamples.length) {
      const start = Math.floor(this.inputPosition);
      const end = Math.max(start + 1, Math.floor(this.inputPosition + ratio));
      let total = 0;
      let count = 0;
      for (
        let index = start;
        index < end && index < this.inputSamples.length;
        index += 1
      ) {
        total += this.inputSamples[index];
        count += 1;
      }
      this.pcmSamples.push(total / count);
      this.inputPosition += ratio;
    }

    const consumed = Math.floor(this.inputPosition);
    if (consumed > 0) {
      this.inputSamples.splice(0, consumed);
      this.inputPosition -= consumed;
    }

    const chunks: ArrayBuffer[] = [];
    while (this.pcmSamples.length >= this.chunkSamples) {
      const samples = this.pcmSamples.splice(0, this.chunkSamples);
      const buffer = new ArrayBuffer(this.chunkSamples * 2);
      const view = new DataView(buffer);
      samples.forEach((sample, index) => {
        const clamped = Math.max(-1, Math.min(1, sample));
        const value = clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff;
        view.setInt16(index * 2, Math.round(value), true);
      });
      chunks.push(buffer);
    }
    return chunks;
  }
}
