import { Module } from '@nestjs/common';
import { AsrBackendService } from './asr-backend.service';
import { AsrGateway } from './asr.gateway';
import { SessionManager } from './session.manager';

/**
 * ASR 模块：Gateway（协议适配）→ Service（后端连接管理）→ SessionManager（路由表）。
 */
@Module({
  providers: [AsrGateway, AsrBackendService, SessionManager],
})
export class AsrModule {}
