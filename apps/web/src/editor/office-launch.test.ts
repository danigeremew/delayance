import { describe, expect, it } from 'vitest';
import { buildOfficeLaunchUrl } from './office-launch';

describe('buildOfficeLaunchUrl', () => {
  it('adds an encoded WOPISrc query parameter to a discovery action URL', () => {
    const result = buildOfficeLaunchUrl(
      'http://localhost:9980/browser/build/cool.html?',
      'http://host.docker.internal:48722/wopi/files/document-id',
    );

    const parsed = new URL(result);
    expect(parsed.searchParams.get('WOPISrc')).toBe(
      'http://host.docker.internal:48722/wopi/files/document-id',
    );
  });
});
