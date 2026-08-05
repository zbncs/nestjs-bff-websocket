import { useEffect, useRef } from 'react';
import { useAsrStore } from '../store/asrStore';

/** 已确认文本与当前动态文本在同一连续内容区域中展示。 */
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
        <p className="transcript-view__empty">
          点击按钮开始录音，识别结果将实时显示在这里。
        </p>
      )}
      {(finals.length > 0 || partialText) && (
        <p className="transcript-view__content">
          <span className="transcript-view__final">{finals.join('')}</span>
          {partialText && <span className="transcript-view__partial">{partialText}</span>}
        </p>
      )}
      <div ref={bottomRef} />
    </div>
  );
}
