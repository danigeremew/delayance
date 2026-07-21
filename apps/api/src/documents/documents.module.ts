import { Module } from '@nestjs/common';
import { TemplatesModule } from '../templates/templates.module';
import { DocumentHealthController } from './document-health.controller';
import { DocumentsController } from './documents.controller';
import { DocumentsService } from './documents.service';

@Module({
  imports: [TemplatesModule],
  controllers: [DocumentsController, DocumentHealthController],
  providers: [DocumentsService],
  exports: [DocumentsService],
})
export class DocumentsModule {}
