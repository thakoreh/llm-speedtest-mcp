// Every request stays in this process. Never delegate to real fetch.
const assert = require('node:assert/strict');
globalThis.fetch = async (url, options) => {
  assert.match(url, /^https:\/\/(api\.openai\.com|api\.anthropic\.com|api\.groq\.com|openrouter\.ai|api\.deepseek\.com|api\.minimax\.chat|open\.bigmodel\.cn|api\.moonshot\.cn)\//);
  assert.equal(options.method, 'POST');
  assert.equal(options.redirect, 'error');
  const body = JSON.parse(options.body);
  assert.equal(body.stream, true);
  assert.equal(body.max_tokens, 256);
  assert.equal(typeof body.messages[0].content, 'string');
  const mode = process.env.QA_FAILURE;
  if (mode === 'success') {
    const payload = url.includes('anthropic')
      ? { type: 'content_block_delta', delta: { text: 'A harmless fixture response.' } }
      : { choices: [{ delta: { content: 'A harmless fixture response.' } }] };
    return new Response(`data: ${JSON.stringify(payload)}\n\ndata: [DONE]\n\n`);
  }
  if (mode === 'http') return new Response(process.env.OPENAI_API_KEY + ' invalid credential', { status: 401 });
  if (mode === 'network') throw new Error(process.env.OPENAI_API_KEY + ' connection failed');
  if (mode === 'hang') {
    // A deterministic stand-in for a hung provider: require a live abort signal.
    assert.ok(options.signal instanceof AbortSignal, 'provider requests need an abort signal');
    return await new Promise((resolve, reject) => {
      options.signal.addEventListener('abort', () => {
        console.error('QA provider aborted');
        reject(options.signal.reason);
      }, { once: true });
    });
  }
  const content = url.includes('anthropic')
    ? { type: 'content_block_delta', delta: { text: 'partial text' } }
    : { choices: [{ delta: { content: 'partial text' } }] };
  if (mode === 'truncated') return new Response(`data: ${JSON.stringify(content)}\n\n`);
  const failure = url.includes('anthropic')
    ? { type: 'error', error: { type: 'overloaded_error', message: 'fixture overloaded' } }
    : { error: { message: 'fixture overloaded' } };
  return new Response(`data: ${JSON.stringify(content)}\n\ndata: ${JSON.stringify(failure)}\n\n`);
};
