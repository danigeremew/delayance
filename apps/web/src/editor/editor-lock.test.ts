import { afterEach, describe, expect, it, vi } from 'vitest';
import { releaseEditorLock } from './editor-lock';

afterEach(() => vi.unstubAllGlobals());
describe('page-exit editor lock release', () => {
  it('uses a simple form beacon with the scoped token and exact lock', () => {
    const sendBeacon = vi.fn().mockReturnValue(true);
    const fetch = vi.fn();
    vi.stubGlobal('navigator', { sendBeacon });
    vi.stubGlobal('fetch', fetch);
    releaseEditorLock(
      new URL('https://api.test/wopi/files/doc?access_token=test-session'),
      'own-lock',
    );
    const [url, body] = sendBeacon.mock.calls[0]!;
    expect(url).toBe('https://api.test/wopi/files/doc/release?access_token=test-session');
    expect(body).toBeInstanceOf(URLSearchParams);
    expect(body.toString()).toBe('lock=own-lock');
    expect(fetch).not.toHaveBeenCalled();
  });
  it.each([false, 'throws'])('falls back to keepalive when beacon %s', (result) => {
    vi.stubGlobal('navigator', {
      sendBeacon: () => {
        if (result === 'throws') throw new Error('Unavailable');
        return false;
      },
    });
    const fetch = vi.fn().mockRejectedValue(new Error('Page closed'));
    vi.stubGlobal('fetch', fetch);
    releaseEditorLock(
      new URL('https://api.test/wopi/files/doc?access_token=test-session'),
      'own-lock',
    );
    expect(fetch).toHaveBeenCalledWith(
      expect.any(URL),
      expect.objectContaining({ method: 'POST', keepalive: true }),
    );
    expect(fetch.mock.calls[0]![1].body.toString()).toBe('lock=own-lock');
  });
});
