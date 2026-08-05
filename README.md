# 语音实时转写 Monorepo

浏览器采集 PCM 音频，通过 NestJS BFF 转发到 ASR Mock，并实时展示流式识别结果。

```text
web-h5 (:5173)  -- native WebSocket -->  bff-server (:3000)  -- managed connection -->  asr-mock-server (:3001)
```

浏览器只依赖 BFF 的公开协议。BFF 负责识别会话状态、协议边界和后端连接管理，替换真实 ASR 服务时无需修改前端业务协议。

## 服务地址

| 模块 | 地址 | 说明 |
| --- | --- | --- |
| Web H5 | `http://localhost:5173` | React + Zustand 前端 |
| BFF | `ws://localhost:3000/intelligentVoice/asr/stream` | 浏览器唯一感知的 WebSocket 接口 |
| ASR Mock | `ws://localhost:3001/intelligentVoice/asr/stream` | 供 BFF 联调的模拟识别服务 |

## 启动

```bash
pnpm install
pnpm run dev:mock
pnpm run dev:bff
pnpm run dev:h5
```

三个开发命令分别在独立终端运行。浏览器打开 `http://localhost:5173`。

```bash
pnpm run typecheck
pnpm run --workspace bff-server build
pnpm run --workspace web-h5 build
```

## 公开协议

- 查询参数：`sampleRate=16000&language=zh-CN`，均可省略并使用默认值。
- 音频消息：PCM、16-bit、小端序、单声道二进制数据，前端发送 3200 字节分片。
- 停止消息：JSON 文本 `{"action":"stop"}`。
- 响应消息：JSON 文本 `{code,msg,data:{text,isFinal}}`。
- `stop` 结束当前识别 Session，但不关闭 WebSocket；下一段音频开始新 Session。
- 连续 60 秒无数据、页面离开或服务异常时关闭连接。

完整字段定义见 [ASR WebSocket 接口文档](docs/asr-stream-api.md)。架构细节见 [系统设计](docs/system_design.md)。
