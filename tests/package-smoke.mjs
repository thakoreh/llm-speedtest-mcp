// Test a real production-only distributable installed outside this checkout.
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';
const consumer = mkdtempSync(join(tmpdir(), 'speedtest-consumer-'));
const npmCli = process.env.npm_execpath;
if (!npmCli) throw new Error('Run via npm run test:package');
function run(command, args, options = {}) {
  const result = spawnSync(command, args, { encoding: 'utf8', timeout: 120000, ...options });
  if (result.status !== 0) throw new Error((result.error?.message || '') + result.stdout + result.stderr);
  return result.stdout;
}
try {
  const packed = JSON.parse(run(process.execPath, [npmCli, 'pack', '--json', '--pack-destination', consumer]));
  run(process.execPath, [npmCli, 'install', '--omit=dev', '--ignore-scripts', '--no-audit', '--no-fund',
    join(consumer, packed[0].filename)], { cwd: consumer });
  const entry = join(consumer, 'node_modules', 'llm-speedtest-mcp', 'dist', 'index.js');
  const manifest = JSON.parse(readFileSync(join(consumer, 'node_modules', 'llm-speedtest-mcp', 'package.json')));
  if (!manifest.dependencies.zod) throw new Error('Direct Zod runtime dependency missing');
  assert.equal(run(process.execPath, [entry, '--version']).trim(), manifest.version);
  process.stdout.write(run(process.execPath, ['--test', resolve('tests/benchmark.test.mjs'), resolve('tests/onboarding.test.mjs')],
    { env: { ...process.env, QA_ENTRY: entry } }));
} finally { rmSync(consumer, { recursive: true, force: true }); }
