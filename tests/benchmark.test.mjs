import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const entry = process.env.QA_ENTRY || fileURLToPath(new URL('../dist/index.js', import.meta.url));

for (const [provider, model, key] of [
  ['OpenAI', 'gpt-4o', 'OPENAI_API_KEY'],
  ['Anthropic', 'claude-sonnet-4-20250514', 'ANTHROPIC_API_KEY'],
]) {
  for (const split of [false, true]) {
    test(`${provider}: elapsed timing with ${split ? 'fragmented' : 'complete'} SSE`, async () => {
      const transport = new StdioClientTransport({
        command: process.execPath,
        args: [
          '--require', fileURLToPath(new URL('./fixtures/mock-provider.cjs', import.meta.url)),
          entry,
        ],
        env: { [key]: 'offline-fixture-not-a-real-key', BENCHMARK_FIXTURE_SPLIT: String(split) },
        stderr: 'pipe',
      });
      const client = new Client({ name: 'offline-regression', version: '1.0.0' });
      try {
        await client.connect(transport);
        const result = await client.callTool({
          name: 'benchmark_model', arguments: { provider, model },
        });
        const text = result.content.filter(item => item.type === 'text').map(item => item.text).join('\n');
        const row = text.split('\n').find(line => line.startsWith(`║ ${provider} `));
        assert.ok(row, text);
        // Fixture: first content after 50 ms; end after 150 ms; 16 chars = 4 estimated tokens.
        // 4 tokens / (150 - 50) ms = 40 estimated tokens per second.
        const metrics = row.split('│').slice(2).map(value => Number(value.replace('║', '').trim()));
        assert.deepEqual(metrics, [50, 40, 150, 4], text);
      } finally {
        await client.close();
      }
    });
  }
  test(`${provider}: empty text cannot win a benchmark`, async () => {
    const transport = new StdioClientTransport({
      command: process.execPath,
      args: [
        '--require', fileURLToPath(new URL('./fixtures/mock-provider.cjs', import.meta.url)),
        entry,
      ],
      env: { [key]: 'offline-fixture-not-a-real-key', BENCHMARK_FIXTURE_EMPTY: 'true' },
      stderr: 'pipe',
    });
    const client = new Client({ name: 'offline-empty-regression', version: '1.0.0' });
    try {
      await client.connect(transport);
      const result = await client.callTool({ name: 'benchmark_model', arguments: { provider, model } });
      const text = result.content.filter(item => item.type === 'text').map(item => item.text).join('\n');
      assert.match(text, /ERROR: No text content/);
      assert.doesNotMatch(text, /Fastest:|Lowest TTFT:/);
    } finally {
      await client.close();
    }
  });
}
