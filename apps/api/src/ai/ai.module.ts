import { Module } from '@nestjs/common';
import { DocumentsModule } from '../documents/documents.module';
import { AiController } from './ai.controller';
import { AiService } from './ai.service';
import { OfficeAiService } from './office-ai.service';
import { OfficeModule } from '../office/office.module';

@Module({
  imports: [DocumentsModule, OfficeModule],
  controllers: [AiController],
  providers: [AiService, OfficeAiService],
  exports: [AiService],
})
export class AiModule {}
