import { Module } from '@nestjs/common';
import { JobsModule } from '../jobs/jobs.module';
import { OfficeController, WopiController } from './office.controller';
import { OfficeService } from './office.service';

@Module({
  imports: [JobsModule],
  controllers: [OfficeController, WopiController],
  providers: [OfficeService],
  exports: [OfficeService],
})
export class OfficeModule {}
