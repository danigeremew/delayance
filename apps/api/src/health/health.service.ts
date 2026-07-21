import { Injectable } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import { DatabaseService } from '../database/database.service';
import { RedisService } from '../redis/redis.service';

@Injectable()
export class HealthService {
  constructor(
    private readonly database: DatabaseService,
    private readonly redis: RedisService,
  ) {}

  live() {
    return { status: 'ok' as const };
  }

  async ready() {
    await this.database.db.execute(sql`select 1`);
    const redis = await this.redis.ping();
    return { status: 'ok' as const, database: true, redis: redis === 'PONG' };
  }
}
