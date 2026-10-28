# LLM Speedtest MCP

**Benchmark AI model inference speed — like speedtest.net, but for LLMs.**

Run it locally inside your MCP client to compare first-text latency, total latency and estimated output throughput. Use your own provider accounts and explicitly choose the models to test.

> **Upgrading from v0.1.1:** v0.2.0 removes the fixed model catalog. Bulk benchmarks now require explicit `*_MODELS` selections; MiniMax, ZAI and Kimi require `*_REGION=global|cn`. A configured API key alone no longer starts a bulk benchmark. See the configuration guide below before upgrading.

## 🚀 Quick Start

Install from source with Node.js 20 or newer (required by the patched dependency tree). The package is not currently published on npm, so use the built local entry point rather than `npx llm-speedtest-mcp`.

```bash
git clone https://github.com/thakoreh/llm-speedtest-mcp.git
cd llm-speedtest-mcp
git checkout v0.2.0
npm ci
npm run build
node dist/index.js --version
```

The tested source release is `v0.2.0`. See [CHANGELOG.md](CHANGELOG.md).
The GitHub tag pins the source installation; the package remains unpublished on npm.

Use the absolute path to `dist/index.js` in your MCP client configuration. On Windows, forward slashes work in JSON paths, for example `C:/tools/llm-speedtest-mcp/dist/index.js`.

### Configure in Claude Desktop

Add to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "llm-speedtest": {
      "command": "node",
      "args": ["/absolute/path/to/llm-speedtest-mcp/dist/index.js"]
    }
  }
}
```

### Configure in Cursor

Add to your `.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "llm-speedtest": {
      "command": "node",
      "args": ["/absolute/path/to/llm-speedtest-mcp/dist/index.js"]
    }
  }
}
```

## 🔑 Setting Up API Keys

Set environment variables for the providers you want to test:

```bash
export OPENAI_API_KEY="sk-..."
export ANTHROPIC_API_KEY="sk-ant-..."
export GROQ_API_KEY="gsk_..."
export OPENROUTER_API_KEY="sk-or-..."
export DEEPSEEK_API_KEY="sk-..."
export MINIMAX_API_KEY="..."
export ZAI_API_KEY="..."          # or ZHIPU_API_KEY
export KIMI_API_KEY="..."         # or MOONSHOT_API_KEY
```

For Claude Desktop/Cursor, put variables in the MCP server config's `env` field, or ensure they are inherited by the application process. A desktop app started from an icon may not inherit your terminal's shell profile. Never commit real keys.

### Choose models deliberately

`benchmark_model` accepts a non-empty model ID directly. It no longer rejects new provider models because of a bundled whitelist. You are responsible for choosing an ID your account can use; this does not imply every model supports this server's chat-completion request format.

`benchmark_models` has **no automatic model defaults**. Set a comma-separated `<PROVIDER>_MODELS` list for each provider you want to include. Providers with keys but no model list are skipped. Lists allow 1–8 model IDs per provider, trim whitespace and deduplicate IDs. All selections are validated before any request starts.

For example, a single-provider MCP config (replace the key and path locally):

```json
{
  "mcpServers": {
    "llm-speedtest": {
      "command": "node",
      "args": ["/absolute/path/to/llm-speedtest-mcp/dist/index.js"],
      "env": {
        "ANTHROPIC_API_KEY": "YOUR_API_KEY",
        "ANTHROPIC_MODELS": "claude-haiku-4-5-20251001"
      }
    }
  }
}
```

Ask the client to call `list_providers`, then `benchmark_models`. For an explicit single-model call use `benchmark_model` with `provider: "Anthropic"` and `model: "claude-haiku-4-5-20251001"`. These are actual billable provider calls, not fixtures. The example ID is documented by Anthropic as of October 28, 2026, not a guarantee of future availability or your account's access.

### Select the account region explicitly

MiniMax, ZAI and Kimi require `<PROVIDER>_REGION=global` or `cn` before benchmarking. Choose the endpoint associated with the account that issued your key; China and international keys are not assumed interchangeable. Missing/invalid regions fail before network access. There is no automatic region fallback, redirect following, or arbitrary base-URL override.

| Provider | `global` endpoint | `cn` endpoint |
|----------|-------------------|---------------|
| `MINIMAX_REGION` | `https://api.minimax.io/v1` | `https://api.minimax.cn/v1` |
| `ZAI_REGION` | `https://api.z.ai/api/paas/v4` | `https://open.bigmodel.cn/api/paas/v4` |
| `KIMI_REGION` | `https://api.moonshot.ai/v1` | `https://api.moonshot.cn/v1` |

Existing v0.1.1 users must add region variables when moving to this source; no previous regional destination is silently selected.

### Reasoning and output budgets

Both benchmark tools accept `max_tokens` (1–4096, default 256). This is a requested output budget, not a billing estimate. Some reasoning models can exhaust it before producing visible text. An empty-text response is an error, not a winning speed result; choose a non-reasoning model, a supported thinking setting, or an explicitly larger budget if appropriate.

Optional provider settings are sent only when explicitly configured:
- `DEEPSEEK_THINKING`: `enabled` or `disabled`.
- `MINIMAX_THINKING`: `adaptive` or `disabled`.
- `ZAI_THINKING`: `enabled` or `disabled`.

These modes remain model-specific. For example, MiniMax M3.1-Flash and GLM-5.3 cannot disable thinking; do not set `disabled` for those models. No thinking field is sent to Kimi, OpenAI, Groq, Anthropic or OpenRouter. Unset modes preserve the provider's default, which may involve reasoning and additional latency/cost.

The output budget uses `max_completion_tokens` for OpenAI, Groq and MiniMax; it uses `max_tokens` for the other OpenAI-compatible providers and Anthropic. Model-specific API parameters outside these options are not implemented.

## 🛠️ MCP Tools

### `list_providers`
Shows which providers are configured (which env vars are set). **Does NOT show key values.**

### `benchmark_models`
Runs a standardized prompt through explicitly selected models on configured providers. Measures:
- **TTFT** — Time to First Token (ms)
- **TPS** — Tokens per Second
- **Total Latency** — Wall clock time (ms)
- **Token Count** — Estimated output tokens

### `benchmark_model`
Benchmark a single specific model with a custom prompt.

Both benchmark tools accept an optional `timeout_ms` (1–300000, default 60000) per model. MCP cancellation aborts the provider requests. Failed requests return `isError: true` for a single benchmark or when all models fail; mixed results retain per-model error rows. Provider error bodies and network exception text are omitted because they can contain credentials. HTTP errors retain their status code.

Run `node dist/index.js --help` for command usage or `--version` for the package version. With no arguments the process serves MCP over stdio; it does not print a prompt.

## 📊 Example Output

Illustrative output only; these values are not measured benchmark evidence or current provider rankings.

```
╔══════════════════════════════════════════════════════════════════════════╗
║                    LLM SPEED TEST RESULTS                                ║
╠══════════════════════════════════════════════════════════════════════════╣
║ Provider         │ Model                       │ TTFT   │ TPS    │ Total  │ Tokens ║
║                  │                             │ (ms)   │ (t/s)  │ (ms)   │        ║
╠══════════════════════════════════════════════════════════════════════════╣
║ OpenAI           │ gpt-4o                      │    320 │  42.15 │   6100 │    256 ║
║ Groq             │ llama-3.3-70b-versatile     │     45 │ 185.30 │    520 │    256 ║
║ Anthropic        │ claude-sonnet-4-20250514    │    280 │  58.22 │   4500 │    256 ║
╚══════════════════════════════════════════════════════════════════════════╝

🏆 Fastest: Groq / llama-3.3-70b-versatile at 185.3 tokens/sec
⚡ Lowest TTFT: Groq / llama-3.3-70b-versatile at 45ms
```

## 🏗️ Supported Providers

No hardcoded model allowlist or automatic provider ranking is shipped. See each provider's current model documentation and select only the models you intend to call.

| Provider | API key variable (alternate) | Bulk model-list variable |
|----------|------------------------------|--------------------------|
| OpenAI | `OPENAI_API_KEY` | `OPENAI_MODELS` |
| Anthropic | `ANTHROPIC_API_KEY` | `ANTHROPIC_MODELS` |
| Groq | `GROQ_API_KEY` | `GROQ_MODELS` |
| OpenRouter | `OPENROUTER_API_KEY` | `OPENROUTER_MODELS` |
| DeepSeek | `DEEPSEEK_API_KEY` | `DEEPSEEK_MODELS` |
| MiniMax | `MINIMAX_API_KEY` | `MINIMAX_MODELS` |
| Zhipu/ZAI | `ZAI_API_KEY` (`ZHIPU_API_KEY`) | `ZAI_MODELS` |
| Kimi/Moonshot | `KIMI_API_KEY` (`MOONSHOT_API_KEY`) | `KIMI_MODELS` |

Alternate keys use the canonical model/region prefix (`ZAI`, `KIMI`). A configured key does not establish that it is valid or funded.

Reference documentation checked October 28, 2026:
- [Anthropic model lifecycle](https://docs.anthropic.com/en/docs/about-claude/model-deprecations)
- [Groq reasoning and request options](https://console.groq.com/docs/reasoning)
- [DeepSeek thinking mode](https://api-docs.deepseek.com/guides/thinking_mode/)
- [MiniMax global request format](https://platform.minimax.io/docs/api-reference/text-chat-openai) and [China endpoint](https://platform.minimax.cn/docs/api-reference/text-openai-api)
- [ZAI request format](https://docs.z.ai/api-reference/llm/chat-completion)
- [Kimi thinking models](https://platform.kimi.ai/docs/guide/use-thinking-models)

Provider docs establish request compatibility, not successful paid inference. Offline tests cannot prove current live model availability.

## 🔒 Trust & Security

### This tool is designed to be trusted.

- **This tool never sends your keys anywhere except directly to the AI provider you're testing.**
- **Zero telemetry. Zero analytics. Zero callhome.**
- **Small, inspectable application source; review it before supplying credentials.**
- **No database, no file system writes, no network calls except to provider APIs.**

### Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    YOUR MACHINE                          │
│                                                         │
│  ┌──────────────┐     ┌──────────────────────────┐      │
│  │  AI Tool     │     │  llm-speedtest-mcp       │      │
│  │  (Claude/    │────▶│                          │      │
│  │   Cursor/    │ MCP │  Reads API keys from     │      │
│  │   Hermes)    │◀────│  environment variables   │      │
│  └──────────────┘     │  only. Never logs them.  │      │
│                       └──────────┬───────────────┘      │
│                                  │                      │
│                                  │ Direct API calls     │
│                                  │ (streaming)          │
│                                  │                      │
│                    ┌─────────────┼─────────────┐        │
│                    ▼             ▼             ▼        │
│              ┌──────────┐ ┌──────────┐ ┌──────────┐    │
│              │ OpenAI   │ │ Anthropic│ │  Groq    │    │
│              │ API      │ │ API      │ │  API     │    │
│              └──────────┘ └──────────┘ └──────────┘    │
│                    ▲             ▲             ▲        │
│                    └─────────────┴─────────────┘        │
│                     YOUR keys go ONLY                   │
│                     to the provider.                    │
│                     Nothing in between.                 │
└─────────────────────────────────────────────────────────┘

  ✅ No proxy    ✅ No relay    ✅ No telemetry
  ✅ No database ✅ No logging  ✅ No file writes
```

### Why This Is Safe

1. **Reads keys from env only** — No custom key input, no forms, no prompts for keys.
2. **Keys never logged** — Not in console, not in debug output, not in error messages.
3. **Direct provider calls** — Each API call goes straight from `fetch()` to the provider's API endpoint.
4. **Runtime dependencies are the MCP SDK and Zod** - No axios, analytics packages, or tracking in this server's application code.
5. **No file I/O** — The server reads env vars and makes HTTP requests. That's it.
6. **Auditable** — Review the application source and dependencies before use.

## 📦 Development

```bash
git clone https://github.com/thakoreh/llm-speedtest-mcp.git
cd llm-speedtest-mcp
npm install
npm run build
npm start
```

### How to interpret the numbers

- TTFT is elapsed time from starting the HTTP request to receiving the first text delta, including network and server delay. It does not measure the first hidden reasoning token.
- Total latency runs from request start until the stream ends.
- Output tokens are estimated as roughly four JavaScript string characters per token. TPS uses that estimate divided by the elapsed interval after the first text delta. It is not a provider-reported token count or billing measure.
- `benchmark_models` runs the configured model requests concurrently. A single run is a local observation, not a controlled provider comparison or a quality evaluation.

Empty-text streams produce an error instead of a fabricated token count or a benchmark winner.

### Offline regression tests

```bash
npm test
npm run test:package
```

The tests start the real MCP server over stdio using the SDK client in fresh subprocesses. Preloads replace provider fetch calls with local fixtures. Tests cover both stream formats, elapsed timing, fragmented UTF-8/CRLF data, all eight providers, missing/invalid input, errors after partial output, credential-safe errors, timeouts, cancellation, repeated calls, and command help. Test fixtures use dummy keys and never call a provider API. `test:package` builds a tarball, installs it with production dependencies in a separate temporary directory, and reruns the MCP tests against the installed entry point. Package installation needs registry access; the provider tests remain offline.

## 📄 License

MIT © Hiren Thakore
