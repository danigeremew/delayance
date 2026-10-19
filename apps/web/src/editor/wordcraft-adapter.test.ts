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
  const frame = { contentWindow: source, focus: vi.fn() } as unknown as HTMLIFrameElement;
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
  return { adapter, postMessage, respond, reply };
}
describe('Wordcraft native-range bridge', () => {
  it('ignores foreign origins and validates the native selection contract', async () => {
    const { adapter, respond } = setup();
    const selection = adapter.getSelection();
    respond({ text: 'forged', handle: '99', isCollapsed: false }, true, 'http://other.test');
    respond({ text: 'Original', handle: '1', isCollapsed: false });
    expect(await selection).toEqual({ text: 'Original', handle: '1', isCollapsed: false });
  });
  it('routes command search and history through the narrow native bridge', async () => {
    const { adapter, postMessage, respond } = setup();
    for (const [type, command] of [
      ['search-commands', 'tools.search'],
      ['undo', 'edit.undo'],
      ['redo', 'edit.redo'],
    ] as const) {
      const pending = adapter.executeCommand({ type });
      expect(JSON.parse(postMessage.mock.lastCall![0]).Values).toMatchObject({
        method: 'command',
        params: { command },
      });
      respond({});
      await pending;
    }
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
  it.each(['insertText', 'replaceSelection'] as const)(
    'saves immediately after %s before native dirty notifications',
    async (method) => {
      const { adapter, respond, postMessage, reply } = setup();
      const mutation = adapter[method]('native-range', 'Accepted text');
      respond({});
      await mutation;
      expect(adapter.getSaveState()).toBe('dirty');
      const saving = adapter.save();
      expect(JSON.parse(postMessage.mock.lastCall![0]).MessageId).toBe('Action_Save');
      reply({ MessageId: 'Action_Save_Resp', Values: { success: true } });
      await saving;
    },
  );
  it('preserves saved versions and waits for acknowledgement of dirty saves', async () => {
    const { adapter, postMessage, reply } = setup();
    await adapter.save();
    expect(postMessage).not.toHaveBeenCalled();
    reply({ MessageId: 'Doc_ModifiedStatus', Values: { Modified: true } });
    const saving = adapter.save();
    expect(adapter.getSaveState()).toBe('saving');
    expect(JSON.parse(postMessage.mock.lastCall![0]).MessageId).toBe('Action_Save');
    reply({ MessageId: 'Action_Save_Resp', Values: { success: true } });
    await saving;
    expect(adapter.getSaveState()).toBe('saved');
  });
  it('validates lifecycle messages and rejects failed or disposed saves', async () => {
    const { adapter, reply } = setup();
    reply({ MessageId: 'Doc_ModifiedStatus', Values: { Modified: 'forged' } });
    expect(adapter.getSaveState()).toBe('saved');
    reply({ MessageId: 'Doc_ModifiedStatus', Values: { Modified: true } });
    const saving = adapter.save();
    reply({ MessageId: 'Action_Save_Resp', Values: { success: false } });
    await expect(saving).rejects.toThrow('could not save');
    const pending = adapter.save();
    adapter.dispose();
    await expect(pending).rejects.toThrow('disposed');
  });
  it('reports save timeouts without leaving a pending save', async () => {
    const { adapter, reply } = setup();
    reply({ MessageId: 'Doc_ModifiedStatus', Values: { Modified: true } });
    const saving = adapter.save();
    const rejected = expect(saving).rejects.toThrow('did not confirm');
    await vi.advanceTimersByTimeAsync(30000);
    await rejected;
    expect(adapter.getSaveState()).toBe('error');
  });
});

describe('inline AI previews', () => {
  it('stages without dirtying the saved document, then commits exactly once through a separate request', async () => {
    const { adapter, respond, postMessage } = setup();
    const staging = adapter.previewProposal({
      id: 'proposal',
      handle: '1',
      action: 'insert',
      text: 'Draft',
    });
    expect(JSON.parse(postMessage.mock.lastCall![0]).Values.method).toBe('preview');
    respond({});
    await staging;
    expect(adapter.getSaveState()).toBe('saved');
    const commit = adapter.commitPreview('proposal');
    expect(JSON.parse(postMessage.mock.lastCall![0]).Values.method).toBe('preview-commit');
    respond({});
    await commit;
    expect(adapter.getSaveState()).toBe('dirty');
  });
  it('validates decisions, origins, sources and subscription cleanup', () => {
    const { adapter, reply } = setup();
    const listener = vi.fn();
    const unsubscribe = adapter.subscribePreview(listener);
    const message = {
      MessageId: 'Delayance_PreviewDecision',
      Values: { id: 'proposal', decision: 'accept' },
    };
    reply(message, 'https://foreign.test');
    adapter.handleMessage({
      origin: 'http://wordcraft.test',
      source: null,
      data: message,
    } as MessageEvent);
    reply({ ...message, Values: { id: 'proposal', decision: 'apply' } });
    expect(listener).not.toHaveBeenCalled();
    reply(message);
    expect(listener).toHaveBeenCalledWith(message.Values);
    unsubscribe();
    reply(message);
    expect(listener).toHaveBeenCalledTimes(1);
    adapter.subscribePreview(listener);
    adapter.dispose();
    reply(message);
    expect(listener).toHaveBeenCalledTimes(1);
  });
  it('gives an actionable rebuild error for an older WASM bridge', async () => {
    const { adapter, postMessage, reply } = setup();
    const preview = adapter.previewProposal({
      id: 'proposal',
      handle: '1',
      action: 'insert',
      text: 'Draft',
    });
    const request = JSON.parse(postMessage.mock.lastCall![0]);
    reply({
      MessageId: 'Delayance_Reply',
      Values: {
        requestId: request.Values.requestId,
        ok: false,
        error: 'Unsupported editor request',
      },
    });
    await expect(preview).rejects.toThrow('pnpm wordcraft:build');
  });
  it('discarding does not dirty or save the document', async () => {
    const { adapter, respond, postMessage } = setup();
    const discard = adapter.discardPreview('proposal');
    expect(JSON.parse(postMessage.mock.lastCall![0]).Values.method).toBe('preview-discard');
    respond({});
    await discard;
    expect(adapter.getSaveState()).toBe('saved');
  });
});
