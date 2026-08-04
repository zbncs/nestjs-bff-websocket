import { Module } from '@nestjs/common';
import { AsrModule } from './asr/asr.module';

@Module({
  imports: [AsrModule],
})
export class AppModule {}
