import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtemp, readdir, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { LocalFileStorage, storageFilename } from './index';

let directory: string;
let files: LocalFileStorage;

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'delayance-storage-'));
  files = new LocalFileStorage('files', directory);
  await files.initialize();
});
afterEach(async () => {
  await rm(directory, { recursive: true, force: true });
});

describe('local file storage', () => {
  it('shares files across API/worker instances and preserves bytes after restart', async () => {
    const body = Buffer.from([0, 255, 10, 42]);
    await files.put('documents/id/hash.docx', body);
    const restarted = new LocalFileStorage('files', directory);
    expect(await restarted.get('documents/id/hash.docx')).toEqual(body);
    expect(await restarted.exists('documents/id/hash.docx')).toBe(true);
    expect(await restarted.exists('missing/file')).toBe(false);
    await expect(restarted.get('missing/file')).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('publishes concurrent writes atomically and prevents replacement', async () => {
    const body = Buffer.from('original');
    await Promise.all([files.put('docs/hash.docx', body), files.put('docs/hash.docx', body)]);
    await expect(files.put('docs/hash.docx', Buffer.from('changed'))).rejects.toMatchObject({
      code: 'CONFLICT',
    });
    expect(await files.get('docs/hash.docx')).toEqual(body);
    expect(await readdir(join(directory, 'files/docs'))).toEqual(['hash.docx']);
  });

  it.each(['../escape', '/absolute', 'a/../../escape', 'a//b', 'a/./b', 'a\\b', 'C:/file', 'a\0b'])(
    'rejects unsafe key %j',
    async (key) => {
      await expect(files.put(key, Buffer.from('bad'))).rejects.toMatchObject({
        code: 'INVALID_KEY',
      });
      await expect(files.get(key)).rejects.toMatchObject({ code: 'INVALID_KEY' });
    },
  );

  it('rejects symlink directories and files', async () => {
    await symlink(directory, join(directory, 'files/link'));
    await expect(files.put('link/escape', Buffer.from('bad'))).rejects.toMatchObject({
      code: 'INVALID_KEY',
    });
    await files.put('safe/file', Buffer.from('private'));
    await symlink(join(directory, 'files/safe/file'), join(directory, 'files/link-file'));
    await expect(files.get('link-file')).rejects.toThrow();
    await expect(files.exists('link-file')).rejects.toMatchObject({ code: 'INVALID_KEY' });
  });

  it('does not treat filesystem failures as missing files', async () => {
    await files.put('file', Buffer.from('data'));
    await expect(files.exists('file/child')).rejects.toThrow();
  });

  it('sanitizes uploaded names and export titles into one path component', () => {
    expect(storageFilename('../../report\\file.docx')).toBe('.._.._report_file.docx');
    expect(storageFilename('')).toBe('file');
    expect(storageFilename('a'.repeat(100) + '.docx')).toMatch(/\.docx$/);
    expect(Buffer.byteLength(storageFilename('😀'.repeat(100) + '.pdf'))).toBeLessThan(220);
  });
});
