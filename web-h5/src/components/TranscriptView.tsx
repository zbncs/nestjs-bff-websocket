import type { AsrUiState } from '../hooks/useAsr';

/** 录音期间显示状态动画，停止后只展示完整识别结果。 */
export function TranscriptView({ state, text }: { state: AsrUiState; text: string }): JSX.Element {
  const isRecording = state === 'connecting' || state === 'recording';

  return (
    <div className="transcript-view">
      {isRecording && (
        <p className="transcript-view__recording" role="status">
          <span className="transcript-view__recording-dot" aria-hidden="true" />
          <span className="transcript-view__recording-text">正在录制中</span>
          <span className="transcript-view__dots" aria-hidden="true">
            <span>.</span><span>.</span><span>.</span>
          </span>
        </p>
      )}
      {!isRecording && state !== 'stopping' && !text && (
        <p className="transcript-view__empty">
          点击按钮开始录音，完整识别结果将在录音结束后显示。
        </p>
      )}
      {!isRecording && text && (
        <p className="transcript-view__content">
          <span className="transcript-view__final">{text}</span>
        </p>
      )}
    </div>
  );
}
