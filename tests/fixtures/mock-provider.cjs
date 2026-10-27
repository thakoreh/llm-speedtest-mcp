// Offline-only preload for MCP integration tests. Never delegates to real fetch.
let clock = 10000;
Object.defineProperty(performance, 'now', { value: () => clock });

globalThis.fetch = async (url) => {
  const anthropic = url === 'https://api.anthropic.com/v1/messages';
  if (!anthropic && url !== 'https://api.openai.com/v1/chat/completions') {
    throw new Error('Unexpected network request in offline fixture');
  }
  const empty = process.env.BENCHMARK_FIXTURE_EMPTY === 'true';
  const payload = empty
    ? anthropic ? { type: 'message_stop' } : { choices: [{ delta: {} }] }
    : anthropic
      ? { type: 'content_block_delta', delta: { text: 'caféabcdefghijkl' } }
      : { choices: [{ delta: { content: 'caféabcdefghijkl' } }] };
  const event = Buffer.from('data: ' + JSON.stringify(payload) + '\r\n\r\n');
  // Split the multibyte é as well as the JSON frame; decoded text is 16 UTF-16 units.
  const boundary = event.indexOf(Buffer.from('é')) + 1;
  const chunks = process.env.BENCHMARK_FIXTURE_SPLIT === 'true'
    ? [event.subarray(0, boundary), event.subarray(boundary), Buffer.from('data: [DONE]\n\n')]
    : [event, Buffer.from('data: [DONE]\n\n')];
  const times = chunks.length === 3 ? [10025, 10050, 10150] : [10050, 10150];
  let index = 0;
  return {
    ok: true,
    body: {
      getReader: () => ({
        releaseLock() {},
        async cancel() {},
        async read() {
          if (index === chunks.length) return { done: true };
          clock = times[index];
          return { done: false, value: chunks[index++] };
        },
      }),
    },
  };
};
