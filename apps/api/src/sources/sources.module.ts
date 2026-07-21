import { Module } from '@nestjs/common';
import { JobsModule } from '../jobs/jobs.module';
import { SearchService } from './search.service';
import { SourcesController } from './sources.controller';
import { SourcesService } from './sources.service';

@Module({
  imports: [JobsModule],
  controllers: [SourcesController],
  providers: [SourcesService, SearchService],
  exports: [SourcesService, SearchService],
})
export class SourcesModule {}
