import { Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { JobsService } from './jobs.service';

@ApiTags('jobs')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('jobs')
export class JobsController {
  constructor(private readonly jobs: JobsService) {}

  @Post('ping')
  ping() {
    return this.jobs.enqueuePing();
  }

  @Get(':jobId')
  get(@Param('jobId') jobId: string) {
    return this.jobs.getJob(jobId);
  }
}
