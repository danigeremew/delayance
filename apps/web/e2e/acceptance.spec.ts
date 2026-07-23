import { test, expect, request } from '@playwright/test';
import JSZip from 'jszip';

const API = process.env.PLAYWRIGHT_API_URL ?? 'http://localhost:48722';

test.describe('§42 acceptance (API)', () => {
  test('register → project → document → save → export markdown/docx → source search', async () => {
    const api = await request.newContext({ baseURL: API });
    const email = `e2e_${Date.now()}@example.com`;
    const password = 'password12345';

    const reg = await api.post('/auth/register', {
      data: { email, password, name: 'E2E User' },
    });
    expect(reg.ok()).toBeTruthy();
    const tokens = await reg.json();
    const headers = { Authorization: `Bearer ${tokens.accessToken}` };

    const projectRes = await api.post('/projects', {
      headers,
      data: { name: 'E2E Project', description: '' },
    });
    expect(projectRes.ok()).toBeTruthy();
    const project = await projectRes.json();

    const docRes = await api.post(`/projects/${project.id}/documents`, {
      headers,
      data: { title: 'E2E Doc' },
    });
    expect(docRes.ok()).toBeTruthy();
    const doc = await docRes.json();

    const sectionId = crypto.randomUUID();
    const headingId = crypto.randomUUID();
    const content = {
      id: doc.content?.id ?? crypto.randomUUID(),
      title: 'E2E Doc',
      template: doc.content?.template,
      children: [
        {
          id: sectionId,
          type: 'section',
          children: [
            {
              id: headingId,
              type: 'heading',
              level: 1,
              content: [{ type: 'text', text: 'Chapter one' }],
            },
          ],
        },
      ],
    };

    const patch = await api.patch(`/projects/${project.id}/documents/${doc.id}/content`, {
      headers,
      data: { content, createVersion: true, versionReason: 'e2e' },
    });
    expect(patch.ok()).toBeTruthy();

    const mdExport = await api.post(`/projects/${project.id}/documents/${doc.id}/export`, {
      headers,
      data: { format: 'markdown' },
    });
    expect(mdExport.ok()).toBeTruthy();
    const mdBody = await mdExport.json();
    expect(mdBody.downloadUrl).toBeTruthy();

    const docxExport = await api.post(`/projects/${project.id}/documents/${doc.id}/export`, {
      headers,
      data: { format: 'docx' },
    });
    expect(docxExport.ok()).toBeTruthy();
    const docxBody = await docxExport.json();
    expect(docxBody.job?.id).toBeTruthy();

    let ready = false;
    for (let i = 0; i < 30; i++) {
      const job = await api.get(`/jobs/${docxBody.job.id}`, { headers });
      const j = await job.json();
      if (j.status === 'completed') {
        ready = true;
        break;
      }
      if (j.status === 'failed') throw new Error(j.error ?? 'export failed');
      await new Promise((r) => setTimeout(r, 1000));
    }
    expect(ready).toBeTruthy();

    const dl = await api.get(
      `/projects/${project.id}/exports/${docxBody.export.id}/download`,
      { headers },
    );
    expect(dl.ok()).toBeTruthy();
    const dlJson = await dl.json();
    const fileRes = await api.get(dlJson.downloadUrl);
    expect(fileRes.ok()).toBeTruthy();
    const buf = Buffer.from(await fileRes.body());
    const zip = await JSZip.loadAsync(buf);
    expect(zip.file('word/document.xml')).toBeTruthy();
    const xml = await zip.file('word/document.xml')!.async('string');
    expect(xml.includes('instrText') || xml.includes('fldChar')).toBeTruthy();

    const source = await api.post(`/projects/${project.id}/sources`, {
      headers,
      data: {
        title: 'E2E Source Note',
        sourceType: 'note',
        textContent: 'unique search phrase delayance-e2e-42',
        aiMayUse: true,
      },
    });
    expect(source.ok()).toBeTruthy();

    // allow worker embedding
    await new Promise((r) => setTimeout(r, 2000));

    const search = await api.get(
      `/projects/${project.id}/search?q=${encodeURIComponent('delayance-e2e-42')}`,
      { headers },
    );
    expect(search.ok()).toBeTruthy();
    const hits = await search.json();
    expect(hits.hits?.length || hits.sources?.length).toBeGreaterThan(0);

    const health = await api.get(`/projects/${project.id}/documents/${doc.id}/health`, {
      headers,
    });
    expect(health.ok()).toBeTruthy();
  });
});
