import {
  CreateBucketCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Injectable, OnModuleInit } from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
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
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: input.objectKey,
        Body: input.body,
        ContentType: input.contentType,
        Metadata: { sha256 },
      }),
    );
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
    try {
      await this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: objectKey }));
      return true;
    } catch {
      return false;
    }
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
