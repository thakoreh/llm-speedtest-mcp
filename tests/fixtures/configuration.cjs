// Offline-only request contract assertions. Never delegate to the network.
const assert = require('node:assert/strict');
globalThis.fetch = async (url, options) => {
  assert.notEqual(process.env.QA_NO_FETCH, 'true', 'Invalid/unselected configuration must not fetch');
  assert.equal(url, process.env.QA_EXPECT_URL);
  assert.equal(options.redirect, 'error');
  const body = JSON.parse(options.body);
  assert.equal(body.model, process.env.QA_EXPECT_MODEL || 'current-model');
  const param = process.env.QA_TOKEN_PARAM || 'max_tokens';
  assert.equal(body[param], Number(process.env.QA_TOKEN_LIMIT || 256));
  assert.equal(body[param === 'max_tokens' ? 'max_completion_tokens' : 'max_tokens'], undefined);
  assert.equal(body.thinking?.type, process.env.QA_THINKING);
  console.error('QA configuration request verified');
  const text = url.includes('anthropic')
    ? { type: 'content_block_delta', delta: { text: 'Fixture content.' } }
    : { choices: [{ delta: { content: 'Fixture content.' } }] };
  return new Response(`data: ${JSON.stringify(text)}\n\ndata: ${url.includes('anthropic') ? JSON.stringify({type:'message_stop'}) : '[DONE]'}\n\n`);
};
