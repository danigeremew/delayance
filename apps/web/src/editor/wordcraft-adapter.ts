import { wordcraftReplySchema, wordcraftSelectionSchema } from '@delayance/validation';
import { LibreOfficeEditorAdapter } from '@/components/libreoffice-editor';
import type { DocumentLocation, EditorCommand, EditorSelection } from './adapter';

/** Uses Wordcraft's native ranges and revision checks, while keeping the existing save protocol. */
export class WordcraftEditorAdapter extends LibreOfficeEditorAdapter {
  private readonly requests = new Map<
    string,
    { resolve: (value: unknown) => void; reject: (error: Error) => void }
  >();
  constructor(
    private readonly officeFrame: HTMLIFrameElement,
    private readonly origin: string,
    token: string,
    onLoaded?: () => void,
  ) {
    super(officeFrame, origin, token, onLoaded, 'Wordcraft');
  }
  override applyCleanUI() {
    // Wordcraft owns its ribbon and view preferences; Collabora UI messages do not apply.
  }
  override async getSelection(): Promise<EditorSelection> {
    return wordcraftSelectionSchema.parse(await this.request('selection'));
  }
  override async replaceSelection(handle: string, text: string) {
    await this.request('replace', { handle, text });
  }
  override async insertText(handle: string, text: string) {
    await this.request('insert', { handle, text });
  }
  override async navigateTo(location: DocumentLocation) {
    if (!location.excerpt) throw new Error('Use Wordcraft’s navigation pane for this location.');
    await this.request('command', {
      command: 'select.text',
      args: { text: location.excerpt, occurrence: location.occurrence ?? 1 },
    });
  }
  override async executeCommand(command: EditorCommand) {
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
  override handleMessage(event: MessageEvent) {
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
    super.handleMessage(event);
  }
  override dispose() {
    for (const request of this.requests.values()) request.reject(new Error('Editor disposed.'));
    this.requests.clear();
    super.dispose();
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
