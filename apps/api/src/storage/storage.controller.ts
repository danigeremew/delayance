import { Controller, Get, Header, Query, StreamableFile } from '@nestjs/common';
import { StorageService } from './storage.service';

@Controller('storage')
export class StorageController {
  constructor(private readonly storage: StorageService) {}

  // The signed capability is issued only after the caller's existing project checks.
  @Get('download')
  @Header('Cache-Control', 'private, no-store')
  @Header('X-Content-Type-Options', 'nosniff')
  @Header('Referrer-Policy', 'no-referrer')
  async download(@Query('token') token: string, @Query('signature') signature: string) {
    const file = await this.storage.download(token, signature);
    return new StreamableFile(file.body, {
      type: 'application/octet-stream',
      disposition: `attachment; filename*=UTF-8''${encodeURIComponent(file.filename).replace(/['()*]/g, (char) => `%${char.charCodeAt(0).toString(16)}`)}`,
      length: file.body.length,
    });
  }
}
