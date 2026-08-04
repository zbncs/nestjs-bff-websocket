import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { BFF_PORT } from './config';

/**
 * BFF 引导：HTTP 与 WebSocket 同端口 3000。
 */
async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { cors: true });
  await app.listen(BFF_PORT);
  console.log(`[bff] bff-server listening on http://localhost:${BFF_PORT}`);
}

void bootstrap();
