import type { AsrUiState } from '../hooks/useAsr';

const LABELS: Record<AsrUiState, string> = {
  idle: '开始录音',
  connecting: '连接中…',
  recording: '停止录音',
  stopping: '停止中…',
  error: '重试',
};

/**
 * 录音按钮：按状态机变色，recording 时红色呼吸动画。
 * connecting / stopping 期间禁用，error 状态点击即重试。
 */
export function RecordButton({ state, start, stop }: { state: AsrUiState; start: () => Promise<void>; stop: () => void }): JSX.Element {

  const disabled = state === 'connecting' || state === 'stopping';

  const handleClick = (): void => {
    if (state === 'recording') {
      void stop();
    } else if (!disabled) {
      void start();
    }
  };

  return (
    <button
      type="button"
      className={`record-button record-button--${state}`}
      disabled={disabled}
      onClick={handleClick}
    >
      {LABELS[state]}
    </button>
  );
}
