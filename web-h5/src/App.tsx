import { RecordButton } from './components/RecordButton';
import { StatusBar } from './components/StatusBar';
import { TranscriptView } from './components/TranscriptView';

/**
 * 页面组装：状态条 + 结果区 + 录音按钮。组件纯渲染，状态全部来自 asrStore。
 */
export default function App(): JSX.Element {
  return (
    <div className="app">
      <header className="app__header">
        <h1 className="app__title">语音实时转写 Demo</h1>
        <p className="app__subtitle">
          web-h5 → BFF(NestJS) → ASR Mock · 原生 WebSocket 全链路
        </p>
      </header>
      <StatusBar />
      <main className="app__main">
        <TranscriptView />
      </main>
      <footer className="app__footer">
        <RecordButton />
      </footer>
    </div>
  );
}
