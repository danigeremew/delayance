import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LibreOfficeEditorAdapter } from './libreoffice-editor';

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
  const adapter = new LibreOfficeEditorAdapter(frame, 'http://office.test', 'session-token');
  const reply = (
    MessageId: string,
    Values: Record<string, unknown>,
    origin = 'http://office.test',
  ) =>
    adapter.handleMessage({
      origin,
      source,
      data: JSON.stringify({ MessageId, Values }),
    } as unknown as MessageEvent);
  reply('App_LoadingStatus', { Status: 'Document_Loaded' });
  postMessage.mockClear();
  return { adapter, postMessage, reply };
}

describe('LibreOffice editor bridge', () => {
  it('reads selection with Action_Copy and validates message origin', async () => {
    const { adapter, postMessage, reply } = setup();
    const selection = adapter.getSelection();
    expect(JSON.parse(postMessage.mock.calls[0]![0]).MessageId).toBe('Action_Copy');
    reply('Action_Copy_Resp', { content: 'forged' }, 'http://other.test');
    reply('Action_Copy_Resp', { content: 'Selected text' });
    expect(await selection).toMatchObject({ text: 'Selected text', isCollapsed: false });
  });

  it('refuses replacing a changed selection', async () => {
    const { adapter, reply, postMessage } = setup();
    const request = adapter.getSelection();
    reply('Action_Copy_Resp', { content: 'Original' });
    const selection = await request;
    const applying = adapter.replaceSelection(selection.handle, 'Replacement');
    reply('Action_Copy_Resp', { content: 'Different' });
    await expect(applying).rejects.toThrow('selection changed');
    expect(
      postMessage.mock.calls.some(([payload]) => JSON.parse(payload).MessageId === 'Action_Paste'),
    ).toBe(false);
  });

  it('inserts using Action_Paste and waits for WOPI save acknowledgement', async () => {
    const { adapter, reply, postMessage } = setup();
    const request = adapter.getSelection();
    reply('Action_Copy_Resp', { content: '' });
    const selection = await request;
    const applying = adapter.insertText(selection.handle, 'Draft text');
    reply('Action_Copy_Resp', { content: '' });
    await vi.advanceTimersByTimeAsync(0);
    expect(adapter.getSaveState()).toBe('saved');
    reply('Doc_ModifiedStatus', { Modified: true });
    await applying;
    expect(postMessage.mock.calls.map(([payload]) => JSON.parse(payload))).toContainEqual(
      expect.objectContaining({
        MessageId: 'Action_Paste',
        Values: { Mimetype: 'text/plain;charset=utf-8', Data: 'Draft text' },
      }),
    );
    const saving = adapter.save();
    expect(adapter.getSaveState()).toBe('saving');
    reply('Action_Save_Resp', { success: true });
    await saving;
    expect(adapter.getSaveState()).toBe('saved');
  });

  it('reports save failure and rejects requests on disposal', async () => {
    const { adapter, reply } = setup();
    reply('Doc_ModifiedStatus', { Modified: true });
    const saving = adapter.save();
    reply('Action_Save_Resp', { success: false });
    await expect(saving).rejects.toThrow('could not save');
    const selection = adapter.getSelection();
    adapter.dispose();
    await expect(selection).rejects.toThrow('disposed');
  });

  it('preserves the saved DOCX version when the editor has no changes', async () => {
    const { adapter, postMessage } = setup();
    await adapter.save();
    expect(postMessage).not.toHaveBeenCalled();
    expect(adapter.getSaveState()).toBe('saved');
  });
});
