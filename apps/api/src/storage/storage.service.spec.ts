import { describe, expect, it, vi, beforeEach } from 'vitest';
import { StorageService } from './storage.service';

vi.mock('@aws-sdk/client-s3', () => {
  return {
    S3Client: vi.fn().mockImplementation(() => ({
      send: vi.fn().mockImplementation(async (command: any) => {
        if (command && typeof command === 'object' && 'Bucket' in command && 'Key' in command) {
          return {
            Body: {
              transformToByteArray: async () => new Uint8Array([104, 101, 108, 108, 111]),
            },
          };
        }
        return {
          Body: {
            transformToByteArray: async () => new Uint8Array([104, 101, 108, 108, 111]),
          },
        };
      }),
    })),
    CreateBucketCommand: vi.fn().mockImplementation((args) => args),
    PutObjectCommand: vi.fn().mockImplementation((args) => args),
    GetObjectCommand: vi.fn().mockImplementation((args) => args),
  };
});

vi.mock('@aws-sdk/s3-request-presigner', () => {
  return {
    getSignedUrl: vi.fn().mockResolvedValue('https://storage.example.com/signed-url'),
  };
});

describe('StorageService', () => {
  let service: StorageService;
  let mockConfig: any;
  let mockDb: any;

  beforeEach(() => {
    mockConfig = {
      env: {
        MINIO_BUCKET: 'delayance-files',
        MINIO_ENDPOINT: 'localhost',
        MINIO_PORT: 9000,
        MINIO_ACCESS_KEY: 'minio',
        MINIO_SECRET_KEY: 'minio123',
        MINIO_USE_SSL: false,
      },
    };

    mockDb = {
      db: {
        insert: vi.fn().mockReturnValue({
          values: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([
              {
                id: 'obj-123',
                bucket: 'delayance-files',
                objectKey: 'imports/uuid-file.docx',
                contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                sizeBytes: 12,
              },
            ]),
          }),
        }),
      },
    };

    service = new StorageService(mockConfig, mockDb);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('putObject uploads file and stores metadata in DB', async () => {
    const res = await service.putObject({
      projectId: 'proj-1',
      userId: 'user-1',
      keyPrefix: 'imports',
      filename: 'sample.docx',
      contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      body: Buffer.from('test content'),
    });

    expect(res).toBeDefined();
    expect(res.id).toBe('obj-123');
  });

  it('getObjectBuffer retrieves object as Buffer', async () => {
    const buf = await service.getObjectBuffer('imports/sample.docx');
    expect(buf.toString()).toBe('hello');
  });

  it('getSignedDownloadUrl returns presigned download URL', async () => {
    const url = await service.getSignedDownloadUrl('exports/doc.pdf', 3600);
    expect(url).toBe('https://storage.example.com/signed-url');
  });
});
