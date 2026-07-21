import { Module } from '@nestjs/common';
import { DocumentsModule } from '../documents/documents.module';
import { JobsModule } from '../jobs/jobs.module';
import { InterchangeController } from './interchange.controller';
import { InterchangeService } from './interchange.service';

@Module({
  imports: [JobsModule, DocumentsModule],
  controllers: [InterchangeController],
  providers: [InterchangeService],
  exports: [InterchangeService],
})
export class InterchangeModule {}
