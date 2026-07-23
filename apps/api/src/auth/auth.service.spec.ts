import { describe, expect, it, vi, beforeEach } from 'vitest';
import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { AuthService } from './auth.service';

describe('AuthService', () => {
  let service: AuthService;
  let mockDb: any;
  let mockJwt: any;
  let mockConfig: any;

  beforeEach(() => {
    mockDb = {
      db: {
        query: {
          users: {
            findFirst: vi.fn(),
          },
          sessions: {
            findFirst: vi.fn(),
            findMany: vi.fn(),
          },
        },
        insert: vi.fn().mockReturnValue({
          values: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([{ id: 'user-1', email: 'test@example.com', name: 'Test' }]),
          }),
        }),
        update: vi.fn().mockReturnValue({
          set: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              returning: vi.fn().mockResolvedValue([{ id: 'user-1', email: 'updated@example.com', name: 'Updated' }]),
            }),
          }),
        }),
      },
    };

    mockJwt = {
      signAsync: vi.fn().mockResolvedValue('jwt-token'),
    };

    mockConfig = {
      env: {
        JWT_REFRESH_EXPIRES_IN: '7d',
      },
    };

    service = new AuthService(mockDb, mockJwt, mockConfig);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('updateProfile', () => {
    it('throws UnauthorizedException if user not found', async () => {
      mockDb.db.query.users.findFirst.mockResolvedValue(null);
      await expect(service.updateProfile('non-existent', { name: 'New' })).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('updates profile successfully', async () => {
      mockDb.db.query.users.findFirst
        .mockResolvedValueOnce({ id: 'user-1', email: 'test@example.com', name: 'Test' })
        .mockResolvedValueOnce(null);

      const result = await service.updateProfile('user-1', { name: 'Updated', email: 'updated@example.com' });
      expect(result.name).toBe('Updated');
      expect(result.email).toBe('updated@example.com');
    });

    it('throws ConflictException if email belongs to another user', async () => {
      mockDb.db.query.users.findFirst
        .mockResolvedValueOnce({ id: 'user-1', email: 'test@example.com', name: 'Test' })
        .mockResolvedValueOnce({ id: 'user-2', email: 'taken@example.com', name: 'Other User' });

      await expect(
        service.updateProfile('user-1', { email: 'taken@example.com' }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('getSessions', () => {
    it('returns formatted active non-expired sessions', async () => {
      const now = new Date();
      const future = new Date(now.getTime() + 60000);
      mockDb.db.query.sessions.findMany.mockResolvedValue([
        { id: 'sess-1', createdAt: now, expiresAt: future, revokedAt: null },
      ]);

      const res = await service.getSessions('user-1');
      expect(res).toHaveLength(1);
      expect(res[0]?.id).toBe('sess-1');

    });
  });
});
