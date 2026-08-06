import { RecordButton } from './components/RecordButton';
import { StatusBar } from './components/StatusBar';
import { TranscriptView } from './components/TranscriptView';
import { useAsr } from './hooks/useAsr';

/**
 * 页面组装：状态条 + 结果区 + 录音按钮。ASR 状态由 React Hook 持有。
 */
export default function App(): JSX.Element {
  const asr = useAsr();
  return (
    <div className="app">
      <header className="app__header">
        <h1 className="app__title">语音实时转写 Demo</h1>
        <p className="app__subtitle">
          web-h5 → BFF(NestJS) → ASR Mock · 原生 WebSocket 全链路
        </p>
      </header>
      <StatusBar state={asr.state} error={asr.error} start={asr.start} />
      <main className="app__main">
        <TranscriptView state={asr.state} text={asr.text} />
      </main>
      <footer className="app__footer">
        <RecordButton state={asr.state} start={asr.start} stop={asr.stop} />
      </footer>
    </div>
  );
}
