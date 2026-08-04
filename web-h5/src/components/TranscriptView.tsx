import { useEffect, useRef } from 'react';
import { useAsrStore } from '../store/asrStore';

/**
 * 转写结果区：final 实色列表 + 当前 partial 灰色斜体行，自动滚动到底部。
 */
export function TranscriptView(): JSX.Element {
  const finals = useAsrStore((s) => s.finals);
  const partialText = useAsrStore((s) => s.partialText);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [finals, partialText]);

  return (
    <div className="transcript-view">
      {finals.length === 0 && !partialText && (
        <p className="transcript-view__empty">点击按钮开始录音，识别结果将实时显示在这里。</p>
      )}
      <ul className="transcript-view__list">
        {finals.map((text, index) => (
          <li key={`final-${index}`} className="transcript-view__final">
            {text}
          </li>
        ))}
      </ul>
      {partialText && <p className="transcript-view__partial">{partialText}</p>}
      <div ref={bottomRef} />
    </div>
  );
}
