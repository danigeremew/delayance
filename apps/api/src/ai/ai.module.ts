import { Module } from '@nestjs/common';
import { DocumentsModule } from '../documents/documents.module';
import { AiInfraController } from './ai-infra.controller';
import { AiController } from './ai.controller';
import { AiService } from './ai.service';

@Module({
  imports: [DocumentsModule],
  controllers: [AiController, AiInfraController],
  providers: [AiService],
  exports: [AiService],
})
export class AiModule {}
