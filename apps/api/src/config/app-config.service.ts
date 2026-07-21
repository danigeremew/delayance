import { Injectable } from '@nestjs/common';
import { type AppEnv, parseEnv } from '@delayance/validation';

@Injectable()
export class AppConfigService {
  readonly env: AppEnv;

  constructor() {
    this.env = parseEnv(process.env);
  }
}
