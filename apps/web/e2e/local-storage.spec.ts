import { expect, request, test } from '@playwright/test';

const API = process.env.PLAYWRIGHT_API_URL ?? 'http://localhost:48722';
const WEB = process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:48721';

test('local files support document creation, worker exports, signed downloads, and uploads', async () => {
  const api = await request.newContext({
    baseURL: API,
    extraHTTPHeaders: { Origin: new URL(WEB).origin },
  });
  const anonymous = await request.newContext({ baseURL: API });
  let projectId: string | undefined;
  let headers: { Authorization: string } | undefined;
  try {
    const registered = await api.post('/auth/register', {
      data: {
        email: `storage-${crypto.randomUUID()}@example.test`,
        firstName: 'Storage',
        lastName: 'Fixture',
        password: 'Synthetic-storage-1234!',
        confirmPassword: 'Synthetic-storage-1234!',
      },
    });
    expect(registered.status()).toBe(201);
    headers = {
      Authorization: `Bearer ${((await registered.json()) as { accessToken: string }).accessToken}`,
    };
    const project = await api.post('/projects', {
      headers,
      data: { name: 'Local storage fixture' },
    });
    expect(project.status()).toBe(201);
    projectId = ((await project.json()) as { id: string }).id;
    const created = await api.post(`/projects/${projectId}/documents`, {
      headers,
      data: { title: 'Storage fixture' },
    });
    expect(created.status()).toBe(201);
    const document = (await created.json()) as { id: string; fileKey: string };
    expect(document.fileKey).toMatch(/\.docx$/);
    const exported = await api.post(`/projects/${projectId}/documents/${document.id}/export`, {
      headers,
      data: { format: 'docx' },
    });
    expect(exported.status()).toBe(201);
    const exportId = ((await exported.json()) as { export: { id: string } }).export.id;
    const downloadPath = `/projects/${projectId}/exports/${exportId}/download`;
    let downloadUrl = '';
    await expect
      .poll(
        async () => {
          const response = await api.get(downloadPath, { headers });
          if (response.status() !== 200) return false;
          downloadUrl = ((await response.json()) as { downloadUrl: string }).downloadUrl;
          return Boolean(downloadUrl);
        },
        { timeout: 60_000, intervals: [500, 1000, 2000] },
      )
      .toBe(true);
    expect((await anonymous.get(downloadPath)).status()).toBe(401);
    const downloaded = await anonymous.get(downloadUrl);
    expect(downloaded.status()).toBe(200);
    expect(downloaded.headers()['content-disposition']).toContain('attachment;');
    expect(downloaded.headers()['cache-control']).toContain('no-store');
    const bytes = await downloaded.body();
    expect(bytes.subarray(0, 2).toString()).toBe('PK');
    const tampered = new URL(downloadUrl);
    tampered.searchParams.set('signature', '0'.repeat(64));
    expect((await anonymous.get(tampered.toString())).status()).toBe(403);
    expect((await anonymous.get('/storage/download')).status()).toBe(403);
    const uploaded = await api.post(`/projects/${projectId}/files`, {
      headers,
      multipart: {
        file: {
          name: 'round-trip.docx',
          mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          buffer: bytes,
        },
      },
    });
    expect(uploaded.status()).toBe(201);
    expect(await uploaded.json()).toMatchObject({ bucket: 'local', sizeBytes: bytes.length });
  } finally {
    if (projectId && headers) await api.delete(`/projects/${projectId}`, { headers });
    await api.dispose();
    await anonymous.dispose();
  }
});
