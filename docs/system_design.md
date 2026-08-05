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
- 每句话的 `isFinal=true` 只结束当前句，Session 保持 `recognizing` 并继续接收下一句话。
- `stop` 把 Session 切换为 `stopping`；收到停止确认对应的最终响应后回到 `idle`。
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

- `isFinal=false`：替换页面当前句的动态结果。
- `isFinal=true`：用最终内容替换当前动态结果并加入已确认内容，不结束 Session。
- `stop` 后的最终响应：结束当前 Session；空文本只作为结束确认，不追加显示。
- `code!=0`：结束当前录音并展示错误；前端断开异常连接，重试时重新建立连接。

公开协议和错误码见 [asr-stream-api.md](asr-stream-api.md)。
