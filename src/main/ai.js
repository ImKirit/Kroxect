// ai.js — Krate's built-in AI agent. It can list, search and read the user's
// project library through read-only tools and answer questions about it.
// Providers: "anthropic" via the official SDK (API key), or any
// OpenAI-compatible endpoint ("groq", "custom") via fetch.
const path = require('path');
const fsp = require('fs').promises;
const store = require('./store');
const indexer = require('./indexer');

const MAX_TURNS = 8;
const MAX_FILE_BYTES = 40 * 1024;
const TEXT_EXT = new Set([
  '.txt', '.md', '.json', '.js', '.ts', '.py', '.java', '.c', '.cpp', '.cs',
  '.html', '.css', '.xml', '.yml', '.yaml', '.ini', '.cfg', '.toml', '.csv',
  '.log', '.srt', '.glsl', '.sh', '.bat', '.gitignore', '.env.example',
]);

const SYSTEM = `You are the AI assistant inside Krate, a local-first project organizer.
The user's projects are normal folders with metadata (title, tags, status, notes, file nicknames, links).
Use the tools to look things up before answering; never invent files or projects.
When you mention a file, give its project and relative path so the user can find it.
Keep answers short and concrete.`;

const TOOLS = [
  {
    name: 'list_projects',
    description: 'List every project in the library with title, status, tags, favorite flag and folder path. Call this first to get an overview.',
    input_schema: { type: 'object', properties: {}, additionalProperties: false, required: [] },
  },
  {
    name: 'get_project',
    description: 'Get full details for one project: description, notes, links, nicknames and the complete file tree. Call when the user asks about a specific project.',
    input_schema: {
      type: 'object',
      properties: { path: { type: 'string', description: 'Absolute folder path of the project (from list_projects)' } },
      required: ['path'],
      additionalProperties: false,
    },
  },
  {
    name: 'search_library',
    description: 'Fuzzy-search all projects, file names, nicknames and links at once. Use for "where is..." questions.',
    input_schema: {
      type: 'object',
      properties: { query: { type: 'string', description: 'Search term' } },
      required: ['query'],
      additionalProperties: false,
    },
  },
  {
    name: 'read_file',
    description: 'Read a text file inside a project (notes, scripts, configs, subtitles). Max 40KB; binary files are rejected.',
    input_schema: {
      type: 'object',
      properties: { path: { type: 'string', description: 'Absolute file path (project folder + relative path)' } },
      required: ['path'],
      additionalProperties: false,
    },
  },
];

// ------------------------------------------------------------ tool impls --
async function insideLibrary(abs) {
  const projects = await store.listProjects();
  const r = path.resolve(abs).toLowerCase();
  return projects.some((p) => r.startsWith(path.resolve(p.path).toLowerCase() + path.sep) || r === path.resolve(p.path).toLowerCase());
}

async function runTool(name, input) {
  if (name === 'list_projects') {
    const projects = await store.listProjects();
    if (!projects.length) return 'No projects in the library yet.';
    return projects.map((p) =>
      `- ${p.meta.title}${p.meta.favorite ? ' ★' : ''} [${p.meta.status}] tags: ${p.meta.tags.join(', ') || 'none'}\n  path: ${p.path}${p.meta.description ? `\n  ${p.meta.description.split('\n')[0].slice(0, 140)}` : ''}`
    ).join('\n');
  }

  if (name === 'get_project') {
    if (!input.path || !(await insideLibrary(input.path))) return 'Error: not a registered project path.';
    return store.buildContext(input.path);
  }

  if (name === 'search_library') {
    const results = await indexer.search(String(input.query || ''));
    if (!results.length) return 'No matches.';
    return results.slice(0, 25).map((r) => {
      if (r.type === 'project') return `[project] ${r.name} — ${r.abs}`;
      if (r.type === 'link') return `[link] ${r.name} (${r.projectTitle}) — ${r.url}`;
      return `[${r.dir ? 'folder' : 'file'}] ${r.nickname ? `"${r.nickname}" = ` : ''}${r.name} — ${r.projectTitle} / ${r.rel}`;
    }).join('\n');
  }

  if (name === 'read_file') {
    const abs = String(input.path || '');
    if (!(await insideLibrary(abs))) return 'Error: path is outside the project library.';
    if (!TEXT_EXT.has(path.extname(abs).toLowerCase())) return 'Error: not a readable text file type.';
    try {
      const st = await fsp.stat(abs);
      if (st.size > MAX_FILE_BYTES) {
        const fh = await fsp.open(abs, 'r');
        const buf = Buffer.alloc(MAX_FILE_BYTES);
        await fh.read(buf, 0, MAX_FILE_BYTES, 0);
        await fh.close();
        return buf.toString('utf8') + `\n…(truncated, file is ${st.size} bytes)`;
      }
      return await fsp.readFile(abs, 'utf8');
    } catch (err) {
      return `Error reading file: ${err.message}`;
    }
  }

  return `Error: unknown tool ${name}`;
}

// ------------------------------------------------- provider: anthropic ----
async function askAnthropic({ apiKey, model, history, onActivity }) {
  const Anthropic = require('@anthropic-ai/sdk');
  const client = new Anthropic({ apiKey });
  const messages = history.map((m) => ({ role: m.role, content: m.content }));

  for (let turn = 0; turn < MAX_TURNS; turn++) {
    const response = await client.messages.create({
      model: model || 'claude-opus-4-8',
      max_tokens: 10000,
      thinking: { type: 'adaptive' },
      system: SYSTEM,
      tools: TOOLS,
      messages,
    });

    if (response.stop_reason === 'pause_turn') {
      messages.push({ role: 'assistant', content: response.content });
      continue;
    }

    const toolUses = response.content.filter((b) => b.type === 'tool_use');
    if (response.stop_reason !== 'tool_use' || !toolUses.length) {
      const text = response.content.filter((b) => b.type === 'text').map((b) => b.text).join('\n');
      return text || '(no answer)';
    }

    // keep the full content (incl. thinking blocks) in history, then answer every tool call
    messages.push({ role: 'assistant', content: response.content });
    const results = [];
    for (const tu of toolUses) {
      onActivity(`${tu.name}(${JSON.stringify(tu.input).slice(0, 80)})`);
      let out;
      try { out = await runTool(tu.name, tu.input || {}); } catch (err) { out = `Error: ${err.message}`; }
      results.push({ type: 'tool_result', tool_use_id: tu.id, content: String(out).slice(0, 60000) });
    }
    messages.push({ role: 'user', content: results });
  }
  return 'Stopped: too many tool steps. Try a more specific question.';
}

// --------------------------------------- provider: openai-compatible ------
const OPENAI_TOOLS = TOOLS.map((t) => ({
  type: 'function',
  function: { name: t.name, description: t.description, parameters: t.input_schema },
}));

async function askOpenAICompat({ provider, baseUrl, apiKey, model, history, onActivity }) {
  const url = baseUrl.replace(/\/+$/, '') + '/chat/completions';
  const messages = [
    { role: 'system', content: SYSTEM },
    ...history.map((m) => ({ role: m.role, content: m.content })),
  ];
  let useTools = true;
  let toolFails = 0;

  for (let turn = 0; turn < MAX_TURNS; turn++) {
    const payload = { model, messages };
    if (useTools) {
      payload.tools = OPENAI_TOOLS;
      payload.tool_choice = 'auto';
      // Groq's llama models are unreliable with parallel calls
      if (provider === 'groq') payload.parallel_tool_calls = false;
    }
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      let code = '';
      try { code = JSON.parse(body).error.code; } catch { }
      // The model produced a malformed tool call (common with Groq's llama
      // models). Retry once; if it keeps happening, answer without tools but
      // hand the model the library overview so it still knows the projects.
      if (code === 'tool_use_failed' && toolFails < 2) {
        toolFails++;
        onActivity('tool call failed, retrying' + (toolFails === 2 ? ' without tools' : ''));
        if (toolFails === 2) {
          useTools = false;
          const overview = await runTool('list_projects', {}).catch(() => 'unavailable');
          messages.push({
            role: 'system',
            content: 'Tool calling is unavailable right now. Answer from this library overview instead:\n' + String(overview).slice(0, 12000),
          });
        }
        continue;
      }
      throw new Error(`${res.status} ${res.statusText}${body ? ` (${body.slice(0, 300)})` : ''}`);
    }
    const data = await res.json();
    const msg = data.choices && data.choices[0] && data.choices[0].message;
    if (!msg) throw new Error('Empty response from provider.');

    if (!msg.tool_calls || !msg.tool_calls.length) return msg.content || '(no answer)';

    messages.push(msg);
    for (const tc of msg.tool_calls) {
      let input = {};
      try { input = JSON.parse(tc.function.arguments || '{}'); } catch { }
      onActivity(`${tc.function.name}(${(tc.function.arguments || '').slice(0, 80)})`);
      let out;
      try { out = await runTool(tc.function.name, input); } catch (err) { out = `Error: ${err.message}`; }
      messages.push({ role: 'tool', tool_call_id: tc.id, content: String(out).slice(0, 60000) });
    }
  }
  return 'Stopped: too many tool steps. Try a more specific question.';
}

// ------------------------------------------------------------------ api --
// history: [{role: 'user'|'assistant', content: string}]
async function ask({ config, history, onActivity = () => { } }) {
  const ai = config.aiApi || {};
  if (!ai.apiKey) throw new Error('No API key set. Add one in Settings → AI assistant.');

  if (ai.provider === 'anthropic') {
    return askAnthropic({ apiKey: ai.apiKey, model: ai.model, history, onActivity });
  }
  const baseUrl = ai.provider === 'groq' ? 'https://api.groq.com/openai/v1' : (ai.baseUrl || '');
  if (!baseUrl) throw new Error('No base URL set for the custom provider.');
  const model = ai.model || (ai.provider === 'groq' ? 'llama-3.3-70b-versatile' : '');
  if (!model) throw new Error('No model set for the custom provider.');
  return askOpenAICompat({ provider: ai.provider, baseUrl, apiKey: ai.apiKey, model, history, onActivity });
}

// Minimal 1-request connection check with explicit settings (used by the
// Settings "Test" button, before anything is saved).
async function test({ provider, apiKey, model, baseUrl }) {
  if (!apiKey) return { ok: false, error: 'No API key entered.' };
  try {
    if (provider === 'anthropic') {
      const Anthropic = require('@anthropic-ai/sdk');
      const client = new Anthropic({ apiKey });
      const m = model || 'claude-opus-4-8';
      const r = await client.messages.create({
        model: m, max_tokens: 32,
        messages: [{ role: 'user', content: 'Reply with the single word: ok' }],
      });
      return { ok: true, model: r.model };
    }
    const base = provider === 'groq' ? 'https://api.groq.com/openai/v1' : (baseUrl || '');
    if (!base) return { ok: false, error: 'No base URL entered.' };
    const m = model || (provider === 'groq' ? 'llama-3.3-70b-versatile' : '');
    if (!m) return { ok: false, error: 'No model entered.' };
    const res = await fetch(base.replace(/\/+$/, '') + '/chat/completions', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ model: m, max_tokens: 8, messages: [{ role: 'user', content: 'Reply with: ok' }] }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      return { ok: false, error: `${res.status} ${res.statusText}${body ? ' — ' + body.slice(0, 300) : ''}` };
    }
    return { ok: true, model: m };
  } catch (err) {
    return { ok: false, error: String(err.message || err).slice(0, 400) };
  }
}

module.exports = { ask, test };
