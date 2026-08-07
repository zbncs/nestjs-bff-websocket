import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { BFF_PORT } from './config';
import { createNativeWsAdapter } from './protocol/native-ws.adapter';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { cors: true });
  app.useWebSocketAdapter(createNativeWsAdapter(app));
  app.enableShutdownHooks();
  await app.listen(BFF_PORT);
  console.log(`[bff] WebSocket listening on ws://localhost:${BFF_PORT}/intelligentVoice/asr/stream`);
}

void bootstrap();
