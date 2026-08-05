# 语音实时转写系统设计

## 设计原则

Browser 永远不感知后端 ASR 的连接策略。浏览器只使用 BFF 公开的原生 WebSocket 协议；BFF 负责维护连接、识别 Session、协议边界和后端异常隔离。

## 模块职责

| 模块 | 职责 |
| --- | --- |
| `web-h5` | 获取麦克风音频，重采样并编码为 PCM，维护页面状态和识别文本 |
| `bff-server` | 暴露稳定协议，校验参数和消息，维护连接内 Session，管理到 ASR 的连接 |
| `asr-mock-server` | 实现与 ASR 约定的原生 WebSocket 协议，按音频分片生成模拟结果 |

## 连接模型

- 一个浏览器页面维护一条到 BFF 的 WebSocket 长连接。
- 一条连接内同一时间只允许一个识别 Session。
- 第一段二进制音频把 Session 从 `idle` 切换为 `recognizing`。
- `stop` 把 Session 切换为 `stopping`。
- 收到最终结果后回到 `idle`，WebSocket 保持连接，可开始下一次识别。
- 连接连续 60 秒无数据时关闭；浏览器下次录音时自动重连。
- BFF 到 ASR 的连接由 BFF 独立创建、复用和清理，不进入浏览器协议。

## 音频链路

浏览器通过 Web Audio API 获取单声道浮点采样，按连接的 `sampleRate` 重采样，转换为 16-bit little-endian PCM，并按 3200 字节切片。BFF 不解析音频内容，只按二进制帧转发。

## 响应处理

```json
{
  "code": 0,
  "msg": "success",
  "data": {
    "text": "识别文本",
    "isFinal": false
  }
}
```

- `isFinal=false`：替换页面当前的中间结果。
- `isFinal=true`：追加最终结果并结束当前 Session。
- `code!=0`：结束当前录音并展示错误；前端断开异常连接，重试时重新建立连接。

公开协议和错误码见 [asr-stream-api.md](asr-stream-api.md)。
