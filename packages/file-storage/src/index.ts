import { randomUUID } from 'node:crypto';
import { constants } from 'node:fs';
import { link, lstat, mkdir, open, realpath, unlink } from 'node:fs/promises';
import { dirname, extname, join, resolve } from 'node:path';

export const LOCAL_STORAGE_BUCKET = 'local';

export class FileStorageError extends Error {
  constructor(
    readonly code: 'INVALID_KEY' | 'NOT_FOUND' | 'CONFLICT',
    message: string,
  ) {
    super(message);
    this.name = 'FileStorageError';
  }
}

function isMissing(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT';
}

function hasControlCharacters(value: string): boolean {
  return Array.from(value).some((char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127);
}

/** Keep user-supplied names as one portable path component. */
export function storageFilename(name: string): string {
  const clean = Array.from(name)
    .map((char) => (hasControlCharacters(char) || /[/\\:*?"<>|]/.test(char) ? '_' : char))
    .join('');
  const chars = Array.from(clean);
  if (chars.length <= 48) return clean || 'file';
  const extension = extname(clean);
  const suffix = Array.from(extension).length <= 16 ? extension : '';
  return chars.slice(0, 48 - Array.from(suffix).length).join('') + suffix;
}

/** Private disk storage shared by the API and worker; files are never served statically. */
export class LocalFileStorage {
  readonly directory: string;

  constructor(directory: string, baseDirectory: string) {
    this.directory = resolve(baseDirectory, directory);
  }

  async initialize(): Promise<void> {
    await mkdir(this.directory, { recursive: true, mode: 0o700 });
  }

  private async path(key: string, createParents = false): Promise<string> {
    const parts = key.split('/');
    if (
      !key ||
      key.length > 2000 ||
      parts.some(
        (part) => !part || part === '.' || part === '..' || Buffer.byteLength(part) > 255,
      ) ||
      /[\\:]/.test(key) ||
      hasControlCharacters(key)
    ) {
      throw new FileStorageError('INVALID_KEY', 'Invalid file storage key');
    }
    const root = await realpath(this.directory);
    let parent = root;
    for (const part of parts.slice(0, -1)) {
      parent = join(parent, part);
      if (createParents) {
        try {
          await mkdir(parent, { mode: 0o700 });
        } catch (error) {
          if (!(error instanceof Error && 'code' in error && error.code === 'EEXIST')) throw error;
        }
      }
      const entry = await lstat(parent);
      if (!entry.isDirectory() || entry.isSymbolicLink()) {
        throw new FileStorageError('INVALID_KEY', 'Invalid file storage directory');
      }
    }
    return join(parent, parts[parts.length - 1]!);
  }

  async get(key: string): Promise<Buffer> {
    try {
      const path = await this.path(key);
      const file = await open(
        path,
        constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
      );
      try {
        if (!(await file.stat()).isFile()) {
          throw new FileStorageError('INVALID_KEY', 'Invalid stored file');
        }
        return await file.readFile();
      } finally {
        await file.close();
      }
    } catch (error) {
      if (isMissing(error)) throw new FileStorageError('NOT_FOUND', 'Stored file not found');
      throw error;
    }
  }

  async exists(key: string): Promise<boolean> {
    try {
      const entry = await lstat(await this.path(key));
      if (!entry.isFile() || entry.isSymbolicLink()) {
        throw new FileStorageError('INVALID_KEY', 'Invalid stored file');
      }
      return true;
    } catch (error) {
      if (isMissing(error)) return false;
      throw error;
    }
  }

  /** Publish a complete file atomically without overwriting an existing version. */
  async put(key: string, body: Buffer): Promise<void> {
    const path = await this.path(key, true);
    const temporary = join(dirname(path), `.upload-${randomUUID()}`);
    const file = await open(temporary, 'wx', 0o600);
    try {
      try {
        await file.writeFile(body);
        await file.sync();
      } finally {
        await file.close();
      }
      try {
        await link(temporary, path);
      } catch (error) {
        if (!(error instanceof Error && 'code' in error && error.code === 'EEXIST')) throw error;
        if (!(await this.get(key)).equals(body)) {
          throw new FileStorageError('CONFLICT', 'Stored files cannot be overwritten');
        }
      }
    } finally {
      await unlink(temporary);
    }
  }
}
