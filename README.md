# 语音实时转写 Monorepo（web-h5 + NestJS BFF + ASR Mock）

三模块语音实时转写演示系统：浏览器 H5 录音分片 → NestJS BFF 会话路由透传 → ASR Mock 流式返回识别结果。

```
web-h5 (5173)  ──socket.io──▶  bff-server (3000)  ──socket.io──▶  asr-mock-server (3001)
 React+Zustand                 NestJS Gateway                    纯 Node + socket.io
```

## 端口

| 模块 | 端口 | 说明 |
|------|------|------|
| web-h5 | 5173 | Vite 前端，WS 直连 `ws://localhost:3000`，无需 proxy |
| bff-server | 3000 | NestJS BFF，HTTP 与 WS 同端口 |
| asr-mock-server | 3001 | Mock ASR 后端，每 3 个音频分片回 1 条 partial |

## 联调启动顺序

```bash
# 首次：根目录一次安装全部 workspaces 依赖
npm install

# 终端 1 —— 先起 Mock 后端（BFF 建立会话时依赖它）
npm run dev:mock        # asr-mock-server → :3001

# 终端 2 —— 再起 BFF
npm run dev:bff         # bff-server → :3000

# 终端 3 —— 最后起前端
npm run dev:h5          # web-h5 → :5173，浏览器打开 http://localhost:5173
```

类型检查（三包全量）：

```bash
npm run typecheck
```

## 故障演练

- **后端宕机级联通知**：录音过程中 `Ctrl+C` 杀掉 3001（asr-mock-server）→
  BFF 遍历会话路由表，向受影响前端发送 `asr:error{code:BACKEND_UNAVAILABLE}` →
  前端状态条显示错误码并进入 error 状态，可点「重试」。
- **BFF 宕机**：杀掉 3000 → 前端 socket 断开，收 `WS_DISCONNECTED`。
- **后端未启动**：不起 3001 直接录音 → BFF 10s 连不上后端，前端收 `BACKEND_TIMEOUT`。
- **慢启动**：BFF 起来但 5s 内未回 `asr:started` → 前端看门狗触发 `START_TIMEOUT`。
- **麦克风拒绝**：浏览器拒绝麦克风权限 → 本地生成 `MIC_DENIED`；无设备 → `MIC_NOT_FOUND`。

## 消息协议

事件名常量统一定义于 `bff-server/src/protocol/events.ts` 与 `web-h5/src/types/protocol.ts`
（两份内容一致，修改需同步）。

| 方向 | 事件 | Payload |
|------|------|---------|
| C→S | `asr:start` | `{sessionId, mimeType?}` |
| C→S | `asr:audio` | `{sessionId, seq, chunk: Base64, timestamp}` |
| C→S | `asr:stop` | `{sessionId}` |
| S→C | `asr:started` | `{sessionId}` |
| S→C | `asr:partial` | `{sessionId, seq, text}` |
| S→C | `asr:final` | `{sessionId, text}` |
| S→C | `asr:error` | `{sessionId?, code, message}` |
| S→C | `asr:stopped` | `{sessionId?}` |

错误码：`MIC_DENIED / MIC_NOT_FOUND / WS_CONNECT_FAILED / WS_DISCONNECTED /
BACKEND_UNAVAILABLE / BACKEND_TIMEOUT / SESSION_NOT_FOUND / START_TIMEOUT / INVALID_STATE`

## 关键约定

- 音频 chunk 为 Base64 字符串，BFF / Mock **纯透传**，不解码、不落地。
- `sessionId` 由前端 `crypto.randomUUID()` 生成，一次录音会话一个，全流程不变。
- BFF 每个 sessionId 独占一条到 Mock 的 socket.io 连接（`Map<sessionId, BackendSession>` 路由）。
- 超时：前端 connecting 看门狗 5000ms；BFF 等后端连接 10000ms。
- 分片 timeslice 250ms；Mock 每 3 片回 1 条 partial，stop 回 final 汇总 + stopped。

详细设计见 [`docs/system_design.md`](docs/system_design.md)。
