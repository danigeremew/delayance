import type { CSSProperties } from 'react';
import './editor-loading-shell.css';

// Match the pinned Wordcraft ribbon while its native controls initialize.
export const EDITOR_CHROME_INSETS = { top: 124, bottom: 24 };
const tabs = [
  'File',
  'Home',
  'Insert',
  'Draw',
  'Design',
  'Layout',
  'References',
  'Mailings',
  'Review',
  'View',
  'Developer',
  'Zotero',
  'Help',
];

export function EditorLoadingShell({ insets }: { insets?: CSSProperties }) {
  const top = typeof insets?.top === 'number' ? insets.top : EDITOR_CHROME_INSETS.top;
  return (
    <div className="dl-editor-startup" data-testid="editor-loading-shell" aria-busy="true">
      <fieldset
        disabled
        className="dl-editor-startup-ribbon"
        style={{ height: top }}
        aria-label="Document toolbar loading"
      >
        <div className="dl-editor-startup-tabs">
          {tabs.map((tab) => (
            <button key={tab} type="button" className={tab === 'Home' ? 'is-active' : undefined}>
              {tab}
            </button>
          ))}
        </div>
        {top > 60 && (
          <div className="dl-editor-startup-groups">
            <div className="dl-editor-startup-group">
              <button type="button" className="dl-editor-startup-paste">
                <svg width="26" height="28" viewBox="0 0 24 26" fill="none" aria-hidden="true">
                  <path
                    d="M8 4H4v19h15V4h-4M8 2h7v5H8zM8 12h7M8 16h7M8 20h5"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinejoin="round"
                  />
                </svg>
                Paste
              </button>
              <div>
                <button type="button">Cut</button>
                <button type="button">Copy</button>
                <button type="button">Format</button>
              </div>
              <small>Clipboard</small>
            </div>
            <div className="dl-editor-startup-group dl-editor-startup-font">
              <div className="dl-editor-startup-row">
                <select aria-label="Font" defaultValue="">
                  <option value="">Font</option>
                </select>
                <select aria-label="Font size" defaultValue="">
                  <option value="">Size</option>
                </select>
              </div>
              <div className="dl-editor-startup-row">
                {['B', 'I', 'U', 'abc', 'x₂', 'x²', 'A'].map((label) => (
                  <button key={label} type="button">
                    {label}
                  </button>
                ))}
              </div>
              <small>Font</small>
            </div>
            <div className="dl-editor-startup-group">
              <div className="dl-editor-startup-row">
                {['Bullets', 'Numbering', 'Align left', 'Center', 'Align right', 'Justify'].map(
                  (label, index) => (
                    <button key={label} type="button" aria-label={label}>
                      <svg
                        width="19"
                        height="20"
                        viewBox="0 0 20 20"
                        fill="none"
                        aria-hidden="true"
                      >
                        <path
                          d={`M3 5h14M${index % 2 ? 6 : 3} 9h${index % 2 ? 8 : 10}M3 13h14M${index % 2 ? 6 : 3} 17h${index % 2 ? 8 : 10}`}
                          stroke="currentColor"
                          strokeWidth="1.3"
                        />
                      </svg>
                    </button>
                  ),
                )}
              </div>
              <small>Paragraph</small>
            </div>
            <div className="dl-editor-startup-group dl-editor-startup-styles">
              {['Normal', 'No Spacing', 'Heading 1', 'Heading 2'].map((style) => (
                <button key={style} type="button">
                  <span>AaBbCcDd</span>
                  {style}
                </button>
              ))}
              <small>Styles</small>
            </div>
            <div className="dl-editor-startup-group">
              <div>
                <button type="button">Find</button>
                <button type="button">Replace</button>
                <button type="button">Select</button>
              </div>
              <small>Editing</small>
            </div>
          </div>
        )}
      </fieldset>
      <div className="dl-editor-startup-canvas" style={insets}>
        <div className="dl-editor-startup-ruler" aria-hidden="true" />
        <div className="dl-editor-startup-page">
          <div role="status" className="dl-editor-startup-status">
            Loading Wordcraft…
          </div>
          <div className="dl-editor-startup-lines" aria-hidden="true">
            <i />
            <i />
            <i />
            <i />
          </div>
        </div>
      </div>
      <div
        className="dl-editor-startup-statusbar"
        style={{ height: insets?.bottom ?? EDITOR_CHROME_INSETS.bottom }}
        aria-hidden="true"
      />
    </div>
  );
}
