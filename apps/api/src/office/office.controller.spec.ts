import { describe, expect, it, vi } from 'vitest';
import type { Request } from 'express';
import { officeReleaseLockSchema } from '@delayance/validation';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { WopiController } from './office.controller';
import type { OfficeService } from './office.service';

function setup(permission: 'read' | 'write' = 'write') {
  const sessionForToken = vi.fn().mockResolvedValue({ permission });
  const unlock = vi.fn().mockResolvedValue({ ok: true });
  const controller = new WopiController({ sessionForToken, unlock } as unknown as OfficeService);
  const request = { query: { access_token: 'test-session' } } as unknown as Request;
  return { controller, request, sessionForToken, unlock };
}

describe('page-exit WOPI lock release', () => {
  it('verifies the document-scoped session and releases only the supplied lock', async () => {
    const { controller, request, sessionForToken, unlock } = setup();
    expect(await controller.releaseLock('doc', request, { lock: 'own-lock' })).toEqual({
      released: true,
    });
    expect(sessionForToken).toHaveBeenCalledWith('doc', 'test-session');
    expect(unlock).toHaveBeenCalledWith('doc', 'own-lock');
  });
  it('preserves another editor’s lock without returning its value', async () => {
    const { controller, request, unlock } = setup();
    unlock.mockResolvedValue({ ok: false, lock: 'other-editor-private-lock' });
    expect(await controller.releaseLock('doc', request, { lock: 'own-lock' })).toEqual({
      released: false,
    });
  });
  it('rejects viewers and invalid or expired sessions before unlocking', async () => {
    const viewer = setup('read');
    await expect(
      viewer.controller.releaseLock('doc', viewer.request, { lock: 'own-lock' }),
    ).rejects.toThrow('Read-only');
    expect(viewer.unlock).not.toHaveBeenCalled();
    const invalid = setup();
    invalid.sessionForToken.mockRejectedValue(new Error('Invalid session'));
    await expect(
      invalid.controller.releaseLock('doc', invalid.request, { lock: 'own-lock' }),
    ).rejects.toThrow('Invalid session');
    expect(invalid.unlock).not.toHaveBeenCalled();
  });
  it('validates form bodies before use', () => {
    const pipe = new ZodValidationPipe(officeReleaseLockSchema);
    expect(pipe.transform({ lock: 'own-lock' })).toEqual({ lock: 'own-lock' });
    for (const value of [
      {},
      { lock: '' },
      { lock: ['one', 'two'] },
      { lock: 'x'.repeat(1025) },
      { lock: 'own-lock', force: true },
    ]) {
      expect(() => pipe.transform(value)).toThrow('Validation failed');
    }
  });
});
