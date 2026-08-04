import { AsrUiState, useAsrStore } from '../store/asrStore';

const STATE_LABELS: Record<AsrUiState, string> = {
  idle: '空闲',
  connecting: '连接中',
  recording: '录音中',
  stopping: '停止中',
  error: '错误',
};

/**
 * 状态条：连接状态徽标 + 错误提示条带（含错误码与重试按钮）。
 */
export function StatusBar(): JSX.Element {
  const state = useAsrStore((s) => s.state);
  const error = useAsrStore((s) => s.error);
  const start = useAsrStore((s) => s.start);

  return (
    <div className="status-bar">
      <span className={`status-badge status-badge--${state}`}>
        <span className="status-badge__dot" />
        {STATE_LABELS[state]}
      </span>
      {error && (
        <div className="error-banner" role="alert">
          <span className="error-banner__code">[{error.code}]</span>
          <span className="error-banner__message">{error.message}</span>
          <button
            type="button"
            className="error-banner__retry"
            onClick={() => {
              void start();
            }}
          >
            重试
          </button>
        </div>
      )}
    </div>
  );
}
