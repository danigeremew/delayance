import { Module } from '@nestjs/common';
import { ThrottlerModule } from '@nestjs/throttler';
import { AiModule } from './ai/ai.module';
import { AuthModule } from './auth/auth.module';
import { AppConfigModule } from './config/app-config.module';
import { AppConfigService } from './config/app-config.service';
import { DatabaseModule } from './database/database.module';
import { DocumentsModule } from './documents/documents.module';
import { HealthModule } from './health/health.module';
import { InterchangeModule } from './interchange/interchange.module';
import { JobsModule } from './jobs/jobs.module';
import { MemoryModule } from './memory/memory.module';
import { ProjectsModule } from './projects/projects.module';
import { RbacModule } from './rbac/rbac.module';
import { RedisModule } from './redis/redis.module';
import { SourcesModule } from './sources/sources.module';
import { StorageModule } from './storage/storage.module';
import { TemplatesModule } from './templates/templates.module';

@Module({
  imports: [
    AppConfigModule,
    DatabaseModule,
    RedisModule,
    StorageModule,
    RbacModule,
    ThrottlerModule.forRootAsync({
      inject: [AppConfigService],
      useFactory: (config: AppConfigService) => [
        {
          name: 'auth',
          ttl: config.env.AUTH_RATE_LIMIT_TTL_MS,
          limit: config.env.AUTH_RATE_LIMIT_MAX,
        },
      ],
    }),
    AuthModule,
    HealthModule,
    JobsModule,
    ProjectsModule,
    MemoryModule,
    TemplatesModule,
    DocumentsModule,
    InterchangeModule,
    AiModule,
    SourcesModule,
  ],
})
export class AppModule {}
