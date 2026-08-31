import { Module } from '@nestjs/common';
import { TemplatesModule } from '../templates/templates.module';
import { JobsModule } from '../jobs/jobs.module';
import { DocumentHealthController } from './document-health.controller';
import { DocumentsController } from './documents.controller';
import { DocumentsService } from './documents.service';

@Module({
  imports: [TemplatesModule, JobsModule],
  controllers: [DocumentsController, DocumentHealthController],
  providers: [DocumentsService],
  exports: [DocumentsService],
})
export class DocumentsModule {}
