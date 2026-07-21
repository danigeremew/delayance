import {
  CreateBucketCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Injectable, OnModuleInit } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { AppConfigService } from '../config/app-config.service';
import { DatabaseService } from '../database/database.service';
import { storedObjects } from '../database/schema';

@Injectable()
export class StorageService implements OnModuleInit {
  private readonly client: S3Client;
  private readonly bucket: string;

  constructor(
    private readonly config: AppConfigService,
    private readonly database: DatabaseService,
  ) {
    const env = config.env;
    this.bucket = env.MINIO_BUCKET;
    this.client = new S3Client({
      region: 'us-east-1',
      endpoint: `${env.MINIO_USE_SSL ? 'https' : 'http'}://${env.MINIO_ENDPOINT}:${env.MINIO_PORT}`,
      forcePathStyle: true,
      credentials: {
        accessKeyId: env.MINIO_ACCESS_KEY,
        secretAccessKey: env.MINIO_SECRET_KEY,
      },
    });
  }

  async onModuleInit() {
    try {
      await this.client.send(new CreateBucketCommand({ Bucket: this.bucket }));
    } catch {
      // bucket may already exist
    }
  }

  async putObject(input: {
    projectId?: string | null;
    userId?: string | null;
    keyPrefix: string;
    filename: string;
    contentType: string;
    body: Buffer;
  }) {
    const objectKey = `${input.keyPrefix}/${randomUUID()}-${input.filename}`;
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: objectKey,
        Body: input.body,
        ContentType: input.contentType,
      }),
    );
    const [row] = await this.database.db
      .insert(storedObjects)
      .values({
        projectId: input.projectId ?? null,
        bucket: this.bucket,
        objectKey,
        contentType: input.contentType,
        sizeBytes: input.body.length,
        createdBy: input.userId ?? null,
      })
      .returning();
    return row!;
  }

  async getObjectBuffer(objectKey: string): Promise<Buffer> {
    const res = await this.client.send(
      new GetObjectCommand({ Bucket: this.bucket, Key: objectKey }),
    );
    const bytes = await res.Body?.transformToByteArray();
    return Buffer.from(bytes ?? []);
  }

  async getSignedDownloadUrl(objectKey: string, expiresIn = 3600) {
    return getSignedUrl(
      this.client,
      new GetObjectCommand({ Bucket: this.bucket, Key: objectKey }),
      { expiresIn },
    );
  }
}
