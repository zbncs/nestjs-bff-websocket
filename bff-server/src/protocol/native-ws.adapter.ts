import type { INestApplication } from '@nestjs/common';
import { WsAdapter } from '@nestjs/platform-ws';

export const ASR_MESSAGE_EVENT = 'asr.message';

/** Maps raw WebSocket frames to the event envelope used by Nest gateways. */
export function createNativeWsAdapter(app: INestApplication): WsAdapter {
  return new WsAdapter(app, {
    messageParser: (data) => ({
      event: ASR_MESSAGE_EVENT,
      data,
    }),
  });
}
