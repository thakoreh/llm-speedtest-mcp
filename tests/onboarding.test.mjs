import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const entry = process.env.QA_ENTRY || fileURLToPath(new URL('../dist/index.js', import.meta.url));
const fixture = fileURLToPath(new URL('./fixtures/failures.cjs', import.meta.url));
const secret = 'dummy-not-a-real-key';
const expectedVersion = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8')).version;
const textOf = result => result.content.map(item => item.text || '').join('\n');
async function session(env, run) {
  const home = await mkdtemp(join(tmpdir(), 'speedtest-qa-'));
  const client = new Client({ name: 'fresh-user-qa', version: '1.0.0' });
  const transport = new StdioClientTransport({ command: process.execPath,
    args: ['--require', fixture, entry], env: { HOME: home, USERPROFILE: home, ...env }, stderr: 'pipe' });
  let stderr = '';
  transport.stderr.on('data', chunk => { stderr += chunk; });
  try { await client.connect(transport); await run(client, () => stderr); }
  finally { await client.close(); await rm(home, { recursive: true, force: true }); }
}
const call = (client, args = {}, options) => client.callTool({ name: 'benchmark_model',
  arguments: { provider: 'OpenAI', model: 'gpt-4o', ...args } }, undefined, options);

test('fresh session: handshake, list, missing keys, unknown provider/model and repeated calls', async () => {
  await session({}, async client => {
    assert.equal(client.getServerVersion()?.version, expectedVersion);
    assert.deepEqual((await client.listTools()).tools.map(t => t.name).sort(), ['benchmark_model', 'benchmark_models', 'list_providers']);
    assert.match(textOf(await client.callTool({ name: 'list_providers', arguments: {} })), /0\/8 providers configured/);
    assert.match(textOf(await client.callTool({ name: 'benchmark_models', arguments: {} })), /No providers configured/);
    for (let i = 0; i < 2; i++) assert.match(textOf(await call(client)), /not configured/);
    assert.match(textOf(await call(client, { provider: 'unknown' })), /Unknown provider/);
  });
  await session({ OPENAI_API_KEY: secret, QA_FAILURE: 'success' }, async client => {
    assert.equal((await call(client, { model: 'new-provider-model' })).isError, false);
    const invalid = await call(client, { model: 42 });
    assert.equal(invalid.isError, true);
  });
});
test('all eight providers, alternate keys, whitespace input and normal repeated benchmarks', async () => {
  const keys = Object.fromEntries(['OPENAI', 'ANTHROPIC', 'GROQ', 'OPENROUTER', 'DEEPSEEK', 'MINIMAX', 'ZHIPU', 'MOONSHOT']
    .map(name => [`${name}_API_KEY`, secret]));
  await session({ ...keys, MINIMAX_REGION: 'global', ZAI_REGION: 'global', KIMI_REGION: 'global',
    ...Object.fromEntries(['OPENAI', 'ANTHROPIC', 'GROQ', 'OPENROUTER', 'DEEPSEEK', 'MINIMAX', 'ZAI', 'KIMI'].map(name => [`${name}_MODELS`, 'fixture-model'])), QA_FAILURE: 'success' }, async client => {
    const listed = textOf(await client.callTool({ name: 'list_providers', arguments: {} }));
    assert.match(listed, /8\/8 providers configured/);
    assert.doesNotMatch(listed, new RegExp(secret));
    for (let i = 0; i < 2; i++) {
      const result = await client.callTool({ name: 'benchmark_models', arguments: { prompt: '' } });
      assert.equal(result.isError, false, textOf(result));
      assert.doesNotMatch(textOf(result), /ERROR:/);
      assert.match(textOf(result), /Kimi\/Moonshot/);
    }
  });
  await session({ OPENAI_API_KEY: '  ' }, async client => {
    assert.match(textOf(await client.callTool({ name: 'list_providers', arguments: {} })), /0\/8 providers configured/);
  });
});
for (const mode of ['http', 'network']) test(`${mode} failures never echo credentials and set isError`, async () => {
  await session({ OPENAI_API_KEY: secret, QA_FAILURE: mode }, async client => {
    const result = await call(client);
    assert.doesNotMatch(textOf(result), new RegExp(secret));
    assert.equal(result.isError, true);
  });
});
for (const [provider, model, key] of [['OpenAI', 'gpt-4o', 'OPENAI_API_KEY'], ['Anthropic', 'claude-sonnet-4-20250514', 'ANTHROPIC_API_KEY']]) {
  test(`${provider}: stream errors after partial text cannot report success`, async () => {
    await session({ [key]: secret }, async client => {
      const result = await call(client, { provider, model });
      assert.equal(result.isError, true, textOf(result));
      assert.doesNotMatch(textOf(result), /Fastest:/);
    });
  });
  test(`${provider}: truncated response cannot report a benchmark`, async () => {
    await session({ [key]: secret, QA_FAILURE: 'truncated' }, async client => {
      const result = await call(client, { provider, model });
      assert.equal(result.isError, true, textOf(result));
      assert.doesNotMatch(textOf(result), /Fastest:/);
    });
  });
}
test('hung request has bounded timeout and server stays usable', async () => {
  await session({ OPENAI_API_KEY: secret, QA_FAILURE: 'hang' }, async (client, stderr) => {
    const result = await call(client, { timeout_ms: 20 });
    assert.match(textOf(result), /timed out/i);
    assert.equal(result.isError, true);
    assert.match(stderr(), /QA provider aborted/);
    assert.ok((await client.listTools()).tools.length);
  });
});
test('MCP cancellation aborts the provider request and allows another call', async () => {
  await session({ OPENAI_API_KEY: secret, QA_FAILURE: 'hang' }, async (client, stderr) => {
    const controller = new AbortController();
    const pending = call(client, {}, { signal: controller.signal });
    setTimeout(() => controller.abort(), 50);
    await assert.rejects(pending, /abort/i);
    assert.ok((await client.listTools()).tools.length);
    // Verify the server's fetch was aborted, not just the client's wait.
    for (let i = 0; i < 50 && !stderr().includes('QA provider aborted'); i++) {
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    assert.match(stderr(), /QA provider aborted/);
  });
});
test('command help exits without waiting on MCP stdin; unknown args fail', () => {
  const result = spawnSync(process.execPath, [entry, '--help'], { timeout: 2000, encoding: 'utf8', env: {} });
  assert.equal(result.status, 0);
  assert.match(result.stdout, /MCP|stdio/);
  const invalid = spawnSync(process.execPath, [entry, '--invalid'], { timeout: 2000, encoding: 'utf8', env: {} });
  assert.equal(invalid.status, 1);
});
