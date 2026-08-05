import { Module } from '@nestjs/common';
import { AsrBackendService } from './asr-backend.service';
import { AsrGateway } from './asr.gateway';
import { SessionManager } from './session.manager';

@Module({
  providers: [AsrGateway, AsrBackendService, SessionManager],
})
export class AsrModule {}
