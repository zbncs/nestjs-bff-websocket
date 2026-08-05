# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

语音实时转写演示系统：浏览器 H5 采集音频 → NestJS BFF 会话路由 → Mock ASR 流式返回识别结果。
三包 pnpm-workspace monorepo，每个包各自声明依赖，root 仅做聚合。

```
web-h5 (:5173)  ──socket.io──▶  bff-server (:3000)  ──socket.io──▶  asr-mock-server (:3001)
 React + Zustand                 NestJS Gateway                    纯 Node + socket.io
```

## Commands

```bash
# 安装（根目录一次性装全部 workspace）
pnpm install                         # 存在 minimumReleaseAge 校验，可用 pnpm install --no-verify-store 跳过

# 启动（需三个终端，按依赖顺序）
pnpm run dev:mock                    # 1. asr-mock-server → :3001（tsx watch）
pnpm run dev:bff                     # 2. bff-server → :3000（nest start --watch）
pnpm run dev:h5                      # 3. web-h5 → :5173（vite）

# 类型检查（全量）
pnpm run typecheck

# 单包命令
pnpm run --workspace web-h5 build    # 前端构建（tsc --noEmit + vite build）
pnpm run --workspace bff-server build  # BFF 构建（nest build → dist/）
```

## Architecture

### 数据流

前端 `crypto.randomUUID()` 生成 `sessionId` → `asr:start` 经 BFF 开启会话 → BFF 为每个 sessionId 创建独立到 Mock 的 socket.io 连接（`Map<sessionId, BackendSession>` 路由）→ 音频 Base64 分片（250ms/timeslice）经 BFF 纯透传到 Mock → Mock 每 3 片回 1 条 `asr:partial` → `asr:stop` 时回 `asr:final` + `asr:stopped` → 各级清理连接。

### 关键模块

| 模块 | 文件 | 职责 |
|------|------|------|
| **协议定义** | `bff-server/src/protocol/events.ts` + `web-h5/src/types/protocol.ts` | 两份内容必须一致，修改需同步。事件名常量 + payload 类型 + 错误码枚举 |
| **前端状态机** | `web-h5/src/store/asrStore.ts` | Zustand 单一 store：`idle → connecting → recording → stopping → idle/error`。UI 只读，不允许状态碎片散落 |
| **BFF Gateway** | `bff-server/src/asr/asr.gateway.ts` | 前端侧协议适配，入口校验，委托业务给 Service |
| **后端连接管理** | `bff-server/src/asr/asr-backend.service.ts` | 到 Mock 的 socket.io-client 连接管理，10s 超时，级联断连通知 |
| **会话路由表** | `bff-server/src/asr/session.manager.ts` | `Map<sessionId, BackendSession>`，支持多前端并发 |
| **Mock 后端** | `asr-mock-server/src/session.ts` | 每连接独立会话，按计数产出 partial/final，不解码音频 |
| **前端服务层** | `web-h5/src/services/socket.ts` + `audioRecorder.ts` | socket.io-client 封装（5s 超时）+ MediaRecorder 分片采集 |

### 超时常量

- 前端 connecting 看门狗：**5000ms**（`asrStore.ts` 的 `START_TIMEOUT_MS`）
- BFF 等后端连接：**10000ms**（`config.ts` 的 `BACKEND_CONNECT_TIMEOUT_MS`）
- 音频分片间隔：**250ms**（`audioRecorder.ts` 的 `AUDIO_TIMESLICE_MS`）

## Key Conventions

- **音频 chunk 纯透传**：Blob → ArrayBuffer → Base64 字符串，BFF / Mock 绝不解码、不落地
- **事件名只用常量**：从 `protocol/events.ts`（或 `types/protocol.ts`）导入 `AsrClientEvent` / `AsrServerEvent`，禁止字符串字面量
- **sessionId 前端生成**：`crypto.randomUUID()`，一次录音会话一个，全流程不变
- **TypeScript strict: true**：全仓启用，服务端/前端均不写 `any`（socket payload 除外，用协议类型收窄）
- **协议文件同步**：`bff-server/src/protocol/events.ts` 与 `web-h5/src/types/protocol.ts` 内容一致，改一份必须同步另一份
- **asr-mock-server 也自持协议**：`session.ts` 内联了一份常量/类型副本，与 BFF 语义保持一致（Mock 不引入 workspace 共享包，保持零依赖启动）
- **BFF 用 `emitDecoratorMetadata`**：NestJS DI 依赖运行时类型元数据（`tsconfig.json` `emitDecoratorMetadata: true` + `probe-di.ts` 用于验证），`tsconfig.build.json` 继承并开启 `noEmit: false` 用于生产构建
- **端口固定**：web-h5=5173、bff=3000、asr-mock=3001。前端直连 `ws://localhost:3000`，vite 不配 proxy
- **`.npmrc`** 已设置 `minimum-release-age=10`（10 分钟安全窗口），若遇到 `ERR_PNPM_MINIMUM_RELEASE_AGE_VIOLATION` 可临时用 `--no-verify-store` 绕过
