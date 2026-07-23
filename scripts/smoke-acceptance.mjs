#!/usr/bin/env node
/**
 * Live acceptance smoke against running API (+ worker for jobs).
 */
const API = process.env.PLAYWRIGHT_API_URL || 'http://localhost:48722';

async function req(path, { method = 'GET', token, body } = {}) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = text;
  }
  if (!res.ok) {
    throw new Error(`${method} ${path} → ${res.status}: ${typeof data === 'string' ? data : JSON.stringify(data)}`);
  }
  return data;
}

function uuid() {
  return crypto.randomUUID();
}

const results = [];
function pass(name) {
  results.push({ name, ok: true });
  console.log(`PASS  ${name}`);
}
function fail(name, err) {
  results.push({ name, ok: false, err: String(err) });
  console.error(`FAIL  ${name}: ${err}`);
}

async function main() {
  await req('/health');
  pass('health');

  const email = `smoke_${Date.now()}@example.com`;
  const auth = await req('/auth/register', {
    method: 'POST',
    body: { email, password: 'password12345', name: 'Smoke User' },
  });
  const token = auth.accessToken;
  pass('register/login tokens');

  const project = await req('/projects', {
    method: 'POST',
    token,
    body: { name: 'Smoke Project', description: 'rules via memory' },
  });
  pass('create project');

  await req(`/projects/${project.id}/memory`, {
    method: 'POST',
    token,
    body: { kind: 'instruction', body: 'Use formal academic tone.' },
  });
  pass('project memory / writing rules');

  const doc = await req(`/projects/${project.id}/documents`, {
    method: 'POST',
    token,
    body: { title: 'Smoke Document' },
  });
  pass('create document');

  const sectionId = uuid();
  const headingId = uuid();
  const figId = uuid();
  const content = {
    id: doc.content?.id || uuid(),
    title: 'Smoke Document',
    template: doc.content.template,
    children: [
      {
        id: sectionId,
        type: 'section',
        children: [
          {
            id: headingId,
            type: 'heading',
            level: 1,
            content: [{ type: 'text', text: 'Introduction' }],
          },
          {
            id: uuid(),
            type: 'paragraph',
            content: [{ type: 'text', text: 'Hello world for smoke test.' }],
          },
          {
            id: figId,
            type: 'figure',
            caption: {
              id: uuid(),
              type: 'caption',
              content: [{ type: 'text', text: 'A figure' }],
            },
          },
          {
            id: uuid(),
            type: 'crossReference',
            targetId: figId,
            targetKind: 'figure',
            displayMode: 'label',
          },
        ],
      },
      {
        id: uuid(),
        type: 'section',
        children: [
          {
            id: uuid(),
            type: 'heading',
            level: 1,
            content: [{ type: 'text', text: 'Methods' }],
          },
        ],
      },
    ],
  };

  await req(`/projects/${project.id}/documents/${doc.id}/content`, {
    method: 'PATCH',
    token,
    body: { content, createVersion: true, versionReason: 'smoke' },
  });
  pass('write/edit content + version snapshot');

  const section2 = content.children[1].id;
  await req(`/projects/${project.id}/documents/${doc.id}/operations`, {
    method: 'POST',
    token,
    body: {
      operation: {
        type: 'moveSection',
        sectionId: section2,
        parentId: null,
        position: 'before',
        referenceId: sectionId,
      },
    },
  });
  pass('move section (numbering/ops)');

  const versions = await req(`/projects/${project.id}/documents/${doc.id}/versions`, { token });
  if (!Array.isArray(versions) || versions.length < 1) throw new Error('no versions');
  pass(`version history list (${versions.length})`);

  await req(`/projects/${project.id}/documents/${doc.id}/versions/${versions[0].id}/restore`, {
    method: 'POST',
    token,
  });
  pass('restore version (API)');

  await req(`/projects/${project.id}/documents/${doc.id}/comments`, {
    method: 'POST',
    token,
    body: { anchorNodeId: headingId, body: 'Smoke comment' },
  });
  pass('comments');

  const health = await req(`/projects/${project.id}/documents/${doc.id}/health`, { token });
  if (typeof health.issueCount !== 'number') throw new Error('bad health');
  pass('document health');

  const source = await req(`/projects/${project.id}/sources`, {
    method: 'POST',
    token,
    body: {
      title: 'Smoke Source',
      sourceType: 'note',
      textContent: 'unique-smoke-phrase-delayance-42',
      aiMayUse: true,
    },
  });
  pass('source upload/note');

  await new Promise((r) => setTimeout(r, 2500));
  const search = await req(
    `/projects/${project.id}/search?q=${encodeURIComponent('unique-smoke-phrase-delayance-42')}`,
    { token },
  );
  if (!(search.hits?.length > 0)) throw new Error(`search empty: ${JSON.stringify(search)}`);
  pass('project FTS search');

  const md = await req(`/projects/${project.id}/documents/${doc.id}/export`, {
    method: 'POST',
    token,
    body: { format: 'markdown' },
  });
  if (!md.downloadUrl) throw new Error('no md url');
  pass('export markdown');

  const docx = await req(`/projects/${project.id}/documents/${doc.id}/export`, {
    method: 'POST',
    token,
    body: { format: 'docx' },
  });
  if (!docx.job?.id) throw new Error('no docx job');
  let jobDone = false;
  for (let i = 0; i < 40; i++) {
    const job = await req(`/jobs/${docx.job.id}`, { token });
    if (job.status === 'completed') {
      jobDone = true;
      break;
    }
    if (job.status === 'failed') throw new Error(job.error || 'docx job failed');
    await new Promise((r) => setTimeout(r, 1000));
  }
  if (!jobDone) throw new Error('docx job timeout');
  pass('export DOCX job');

  const pdf = await req(`/projects/${project.id}/documents/${doc.id}/export`, {
    method: 'POST',
    token,
    body: { format: 'pdf' },
  });
  if (!pdf.job?.id) throw new Error('no pdf job');
  jobDone = false;
  for (let i = 0; i < 40; i++) {
    const job = await req(`/jobs/${pdf.job.id}`, { token });
    if (job.status === 'completed') {
      jobDone = true;
      break;
    }
    if (job.status === 'failed') throw new Error(job.error || 'pdf job failed');
    await new Promise((r) => setTimeout(r, 1000));
  }
  if (!jobDone) throw new Error('pdf job timeout');
  pass('export PDF job');

  // AI Ask — may fail without provider; record as soft
  try {
    await req(`/projects/${project.id}/ai-settings`, {
      method: 'PUT',
      token,
      body: { provider: 'ollama', model: 'llama3.2', policy: 'local_only', baseUrl: 'http://127.0.0.1:11434/v1' },
    });
    await req(`/projects/${project.id}/documents/${doc.id}/ai/ask`, {
      method: 'POST',
      token,
      body: { instruction: 'Summarize the introduction in one sentence.' },
    });
    pass('AI Ask (Ollama reachable)');
  } catch (e) {
    fail('AI Ask (Ollama)', e.message || e);
  }

  const failed = results.filter((r) => !r.ok);
  console.log('\n---');
  console.log(`Passed ${results.filter((r) => r.ok).length}/${results.length}`);
  if (failed.length) {
    process.exitCode = 1;
  }
}

main().catch((e) => {
  console.error('Fatal:', e);
  process.exit(1);
});
