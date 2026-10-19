import {
  wordcraftReplySchema,
  wordcraftSelectionSchema,
  wordcraftStatusSchema,
  wordcraftModifiedSchema,
  wordcraftSaveResponseSchema,
} from '@delayance/validation';
import type {
  DocumentLocation,
  EditorCommand,
  EditorSelection,
  EditorAdapter,
  EditorSaveState,
} from './adapter';

/** Uses Wordcraft's native ranges and revision checks, while keeping the existing save protocol. */
export class WordcraftEditorAdapter implements EditorAdapter {
  private state: EditorSaveState = 'loading';
  private readonly listeners = new Set<(state: EditorSaveState) => void>();
  private saveRequest: { resolve: () => void; reject: (error: Error) => void } | null = null;
  private readonly requests = new Map<
    string,
    { resolve: (value: unknown) => void; reject: (error: Error) => void }
  >();
  constructor(
    private readonly officeFrame: HTMLIFrameElement,
    private readonly origin: string,
    private readonly token: string,
    private readonly onLoaded?: () => void,
  ) {}

  async openDocument() {}
  async focus() {
    this.send('Action_Focus');
  }
  getSaveState() {
    return this.state;
  }
  getSessionToken() {
    return this.token;
  }
  async getSelectedText() {
    return (await this.getSelection()).text;
  }
  subscribe(listener: (state: EditorSaveState) => void) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
  ready() {
    this.send('Host_PostmessageReady');
  }
  async save(): Promise<void> {
    if (this.state === 'loading') throw new Error('Wait for Wordcraft to load.');
    if (this.saveRequest) throw new Error('A save is already in progress.');
    // Saving unchanged DOCX bytes can invalidate a proposal's version snapshot.
    if (this.state === 'saved') return;
    return new Promise((resolve, reject) => {
      const timeout = window.setTimeout(() => {
        this.saveRequest = null;
        this.setState('error');
        reject(new Error('Wordcraft did not confirm the save. Retry saving before using AI.'));
      }, 30000);
      this.saveRequest = {
        resolve: () => {
          window.clearTimeout(timeout);
          resolve();
        },
        reject: (error) => {
          window.clearTimeout(timeout);
          reject(error);
        },
      };
      this.setState('saving');
      this.send('Action_Save', { Notify: true, DontSaveIfUnmodified: false });
    });
  }
  async getSelection(): Promise<EditorSelection> {
    return wordcraftSelectionSchema.parse(await this.request('selection'));
  }
  async replaceSelection(handle: string, text: string) {
    await this.request('replace', { handle, text });
    // Native dirty notifications arrive on the next render tick, after this reply.
    this.setState('dirty');
  }
  async insertText(handle: string, text: string) {
    await this.request('insert', { handle, text });
    this.setState('dirty');
  }
  async navigateTo(location: DocumentLocation) {
    if (!location.excerpt) throw new Error('Use Wordcraft’s navigation pane for this location.');
    await this.request('command', {
      command: 'select.text',
      args: { text: location.excerpt, occurrence: location.occurrence ?? 1 },
    });
  }
  async executeCommand(command: EditorCommand) {
    if (command.type === 'save') return this.save();
    if (command.type === 'undo' || command.type === 'redo') {
      await this.request('command', { command: `edit.${command.type}` });
      return;
    }
    if (command.type === 'find') {
      await this.request('command', { command: 'edit.find' });
      return;
    }
    const commands: Record<string, string> = {
      '.uno:Undo': 'edit.undo',
      '.uno:Redo': 'edit.redo',
      '.uno:Bold': 'format.bold',
      '.uno:Italic': 'format.italic',
      '.uno:Underline': 'format.underline',
      '.uno:SelectAll': 'select.all',
      '.uno:SearchDialog': 'edit.find',
      '.uno:InsertAnnotation': 'review.newComment',
      '.uno:Zoom100Percent': 'view.zoom100',
    };
    const id = commands[command.command];
    if (!id) throw new Error('Use Wordcraft’s ribbon for this command.');
    await this.request('command', { command: id });
  }
  handleMessage(event: MessageEvent) {
    if (event.origin !== this.origin || event.source !== this.officeFrame.contentWindow) return;
    let data: unknown = event.data;
    if (typeof data === 'string') {
      try {
        data = JSON.parse(data);
      } catch {
        return;
      }
    }
    const reply = wordcraftReplySchema.safeParse(data);
    if (reply.success) {
      const { requestId, ok, result, error } = reply.data.Values;
      const request = this.requests.get(requestId);
      this.requests.delete(requestId);
      if (ok) request?.resolve(result);
      else request?.reject(new Error(error ?? 'Wordcraft request failed.'));
      return;
    }
    const status = wordcraftStatusSchema.safeParse(data);
    if (status.success) {
      if (status.data.Values.Status === 'Document_Loaded') {
        this.setState('saved');
        this.onLoaded?.();
      }
      return;
    }
    const modified = wordcraftModifiedSchema.safeParse(data);
    if (modified.success) {
      this.setState(modified.data.Values.Modified ? 'dirty' : 'saved');
      return;
    }
    const saved = wordcraftSaveResponseSchema.safeParse(data);
    if (saved.success) {
      const pending = this.saveRequest;
      this.saveRequest = null;
      this.setState(saved.data.Values.success ? 'saved' : 'error');
      if (saved.data.Values.success) pending?.resolve();
      else pending?.reject(new Error('Wordcraft could not save the document.'));
    }
  }
  dispose() {
    for (const request of this.requests.values()) request.reject(new Error('Editor disposed.'));
    this.requests.clear();
    this.saveRequest?.reject(new Error('Editor disposed.'));
    this.saveRequest = null;
    this.listeners.clear();
  }
  private setState(state: EditorSaveState) {
    this.state = state;
    this.listeners.forEach((listener) => listener(state));
  }
  private send(MessageId: string, Values: Record<string, unknown> = {}) {
    this.officeFrame.contentWindow?.postMessage(JSON.stringify({ MessageId, Values }), this.origin);
  }
  private request(method: string, params: Record<string, unknown> = {}): Promise<unknown> {
    if (this.getSaveState() === 'loading')
      return Promise.reject(new Error('Wait for Wordcraft to load.'));
    const requestId = crypto.randomUUID();
    return new Promise((resolve, reject) => {
      const timeout = window.setTimeout(() => {
        this.requests.delete(requestId);
        reject(new Error('Wordcraft did not respond. Reopen the document.'));
      }, 10000);
      this.requests.set(requestId, {
        resolve: (value) => {
          window.clearTimeout(timeout);
          resolve(value);
        },
        reject: (error) => {
          window.clearTimeout(timeout);
          reject(error);
        },
      });
      this.officeFrame.contentWindow?.postMessage(
        JSON.stringify({
          MessageId: 'Delayance_Request',
          Values: { requestId, method, params },
        }),
        this.origin,
      );
    });
  }
}
