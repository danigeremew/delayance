export type EditorSaveState = 'loading' | 'saved' | 'saving' | 'dirty' | 'error';

export interface EditorSelection {
  text: string;
  isCollapsed: boolean;
  /** Opaque editor-owned reference; callers must never interpret it. */
  handle: string;
}

export interface DocumentLocation {
  kind: 'bookmark' | 'heading' | 'paragraph' | 'table' | 'figure';
  value: string;
  occurrence?: number;
  excerpt?: string;
}

export type EditorCommand =
  | { type: 'save' }
  | { type: 'undo' }
  | { type: 'redo' }
  | { type: 'find' }
  | { type: 'uno'; command: string; args?: Record<string, unknown> };

export interface EditorAdapter {
  openDocument(): Promise<void>;
  focus(): Promise<void>;
  save(): Promise<void>;
  getSaveState(): EditorSaveState;
  getSelection(): Promise<EditorSelection>;
  getSelectedText(): Promise<string>;
  replaceSelection(handle: string, text: string): Promise<void>;
  insertText(handle: string, text: string): Promise<void>;
  navigateTo(location: DocumentLocation): Promise<void>;
  executeCommand(command: EditorCommand): Promise<void>;
  subscribe(listener: (state: EditorSaveState) => void): () => void;
  dispose(): void;
}
