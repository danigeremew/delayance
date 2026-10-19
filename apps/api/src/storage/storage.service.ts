import {
  Injectable,
  OnModuleInit,
  ForbiddenException,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { createHash, createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { resolve } from 'node:path';
import { z } from 'zod';
import {
  FileStorageError,
  LocalFileStorage,
  LOCAL_STORAGE_BUCKET,
  storageFilename,
} from '@delayance/file-storage';
import { AppConfigService } from '../config/app-config.service';
import { DatabaseService } from '../database/database.service';
import { storedObjects } from '../database/schema';

@Injectable()
export class StorageService implements OnModuleInit {
  private readonly files: LocalFileStorage;
  private readonly bucket = LOCAL_STORAGE_BUCKET;

  constructor(
    private readonly config: AppConfigService,
    private readonly database: DatabaseService,
  ) {
    this.files = new LocalFileStorage(config.env.STORAGE_DIR, resolve(__dirname, '../../../..'));
  }

  async onModuleInit() {
    await this.files.initialize();
  }

  async putObject(input: {
    projectId?: string | null;
    userId?: string | null;
    keyPrefix: string;
    filename: string;
    contentType: string;
    body: Buffer;
  }) {
    const objectKey = `${input.keyPrefix}/${randomUUID()}-${storageFilename(input.filename)}`;
    await this.files.put(objectKey, input.body);
    const [row] = await this.database.db
      .insert(storedObjects)
      .values({
        projectId: input.projectId ?? null,
        bucket: this.bucket,
        objectKey,
        contentType: input.contentType,
        sizeBytes: input.body.length,
        sha256: createHash('sha256').update(input.body).digest('hex'),
        createdBy: input.userId ?? null,
      })
      .returning();
    return row!;
  }

  /** Stores a deterministic object key. Document files use immutable content-addressed keys. */
  async putObjectAtKey(input: {
    projectId?: string | null;
    userId?: string | null;
    objectKey: string;
    contentType: string;
    body: Buffer;
  }) {
    const sha256 = createHash('sha256').update(input.body).digest('hex');
    await this.files.put(input.objectKey, input.body);
    const [row] = await this.database.db
      .insert(storedObjects)
      .values({
        projectId: input.projectId ?? null,
        bucket: this.bucket,
        objectKey: input.objectKey,
        contentType: input.contentType,
        sizeBytes: input.body.length,
        sha256,
        createdBy: input.userId ?? null,
      })
      .returning();
    return { storedObject: row!, sha256, size: input.body.length };
  }

  async objectExists(objectKey: string): Promise<boolean> {
    return this.files.exists(objectKey);
  }

  async getObjectBuffer(objectKey: string): Promise<Buffer> {
    return this.files.get(objectKey);
  }

  async getSignedDownloadUrl(objectKey: string, expiresIn = 3600) {
    const token = Buffer.from(
      JSON.stringify({
        key: objectKey,
        expires: Math.floor(Date.now() / 1000) + expiresIn,
      }),
    ).toString('base64url');
    const url = new URL(
      '/storage/download',
      this.config.env.API_PUBLIC_URL ?? `http://localhost:${this.config.env.API_PORT}`,
    );
    url.searchParams.set('token', token);
    url.searchParams.set('signature', this.sign(token));
    return url.toString();
  }

  private sign(token: string): string {
    return createHmac('sha256', this.config.env.AUTH_JWT_SECRET)
      .update('file-download:')
      .update(token)
      .digest('hex');
  }

  async download(token: string, signature: string) {
    const query = z
      .object({
        token: z
          .string()
          .min(1)
          .max(4096)
          .regex(/^[A-Za-z0-9_-]+$/),
        signature: z.string().regex(/^[a-f0-9]{64}$/),
      })
      .safeParse({ token, signature });
    if (!query.success) throw new ForbiddenException('Invalid download link');
    if (!timingSafeEqual(Buffer.from(signature, 'hex'), Buffer.from(this.sign(token), 'hex'))) {
      throw new ForbiddenException('Invalid download link');
    }
    let value: unknown;
    try {
      value = JSON.parse(Buffer.from(token, 'base64url').toString('utf8'));
    } catch {
      throw new ForbiddenException('Invalid download link');
    }
    const payload = z
      .object({
        key: z.string().min(1).max(2000),
        expires: z.number().int().positive(),
      })
      .strict()
      .safeParse(value);
    if (!payload.success || payload.data.expires <= Math.floor(Date.now() / 1000)) {
      throw new ForbiddenException('Download link expired or invalid');
    }
    try {
      return {
        body: await this.files.get(payload.data.key),
        filename: payload.data.key.split('/').pop()!,
      };
    } catch (error) {
      if (error instanceof FileStorageError) {
        if (error.code === 'NOT_FOUND') throw new NotFoundException('Stored file not found');
        throw new BadRequestException('Invalid file');
      }
      throw error;
    }
  }
}
