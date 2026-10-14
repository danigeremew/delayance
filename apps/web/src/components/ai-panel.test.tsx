import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { AiPanel } from './ai-panel';

describe('AiPanel component', () => {
  it('renders the top-right settings gear button and header controls', () => {
    const html = renderToStaticMarkup(
      <AiPanel
        projectId="project-123"
        documentId="doc-456"
        selectedNodeId={null}
        onAccepted={() => undefined}
      />,
    );

    // AI settings gear button exists in header actions
    expect(html).toContain('aria-label="AI settings"');
    expect(html).toContain('title="AI settings"');
    // Header title and Assistant branding
    expect(html).toContain('Assistant');
    // New chat and chat history action buttons exist
    expect(html).toContain('aria-label="New chat"');
    expect(html).toContain('aria-label="Chat history"');
  });

  it('renders the AI settings configuration view when settings are opened', () => {
    const html = renderToStaticMarkup(
      <AiPanel
        projectId="project-123"
        documentId="doc-456"
        selectedNodeId={null}
        initialShowSettings={true}
        onAccepted={() => undefined}
      />,
    );

    // Header changes to settings title and active gear indicator
    expect(html).toContain('<h2>AI Settings</h2>');
    expect(html).toContain('Configure Gemini API key &amp; model');
    expect(html).toContain('dl-ai-icon-btn is-active');

    // Settings card and status
    expect(html).toContain('dl-ai-settings');
    expect(html).toContain('dl-ai-settings-card');
    expect(html).toContain('Status');

    // Gemini API Key form input
    expect(html).toContain('for="gemini-api-key"');
    expect(html).toContain('Gemini API Key');
    expect(html).toContain('id="gemini-api-key"');
    expect(html).toContain('type="password"');
    expect(html).toContain('aria-label="Show API key"');

    // Gemini Model dropdown with models
    expect(html).toContain('id="gemini-model-select"');
    expect(html).toContain('gemini-3.8-flash');
    expect(html).toContain('gemini-3.1-pro-preview');
    expect(html).toContain('Custom model ID');
    expect(html).toContain('Test saved connection');
    expect(html).toContain('gemini-2.5-flash');
    expect(html).toContain('gemini-2.5-pro');

    // Policy selector
    expect(html).toContain('id="gemini-policy-select"');
    expect(html).toContain('Allow external AI (Gemini)');
    expect(html).toContain('Local only (block external calls)');

    // Action buttons
    expect(html).toContain('Save Settings');
    expect(html).toContain('Back to Chat');
  });
});
