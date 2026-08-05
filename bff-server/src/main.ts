import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { BFF_PORT } from './config';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { cors: true });
  app.enableShutdownHooks();
  await app.listen(BFF_PORT);
  console.log(`[bff] WebSocket listening on ws://localhost:${BFF_PORT}/intelligentVoice/asr/stream`);
}

void bootstrap();
