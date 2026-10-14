import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WordcraftEditorAdapter } from './wordcraft-adapter';

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('window', { setTimeout, clearTimeout });
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
function setup() {
  const postMessage = vi.fn();
  const source = { postMessage };
  const frame = { contentWindow: source } as unknown as HTMLIFrameElement;
  const adapter = new WordcraftEditorAdapter(frame, 'http://wordcraft.test', 'wopi-token');
  const reply = (data: unknown, origin = 'http://wordcraft.test') =>
    adapter.handleMessage({
      origin,
      source,
      data: JSON.stringify(data),
    } as unknown as MessageEvent);
  reply({ MessageId: 'App_LoadingStatus', Values: { Status: 'Document_Loaded' } });
  postMessage.mockClear();
  const respond = (result: unknown, ok = true, origin?: string) => {
    const message = JSON.parse(postMessage.mock.lastCall![0]);
    reply(
      {
        MessageId: 'Delayance_Reply',
        Values: {
          requestId: message.Values.requestId,
          ok,
          result,
          error: ok ? undefined : 'Selection changed',
        },
      },
      origin,
    );
  };
  return { adapter, postMessage, respond };
}
describe('Wordcraft native-range bridge', () => {
  it('ignores foreign origins and validates the native selection contract', async () => {
    const { adapter, respond } = setup();
    const selection = adapter.getSelection();
    respond({ text: 'forged', handle: '99', isCollapsed: false }, true, 'http://other.test');
    respond({ text: 'Original', handle: '1', isCollapsed: false });
    expect(await selection).toEqual({ text: 'Original', handle: '1', isCollapsed: false });
  });
  it('surfaces a stale native range instead of pasting elsewhere', async () => {
    const { adapter, respond, postMessage } = setup();
    const applying = adapter.replaceSelection('1', 'Replacement');
    expect(JSON.parse(postMessage.mock.lastCall![0]).Values).toMatchObject({
      method: 'replace',
      params: { handle: '1', text: 'Replacement' },
    });
    respond(null, false);
    await expect(applying).rejects.toThrow('Selection changed');
  });
  it('rejects malformed selections and pending requests on disposal', async () => {
    const { adapter, respond } = setup();
    const malformed = adapter.getSelection();
    respond({ text: 'Original', handle: '', isCollapsed: false });
    await expect(malformed).rejects.toThrow();
    const pending = adapter.getSelection();
    adapter.dispose();
    await expect(pending).rejects.toThrow('disposed');
  });
});
