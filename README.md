# LLM Speedtest MCP

**Benchmark AI model inference speed — like speedtest.net, but for LLMs.**

Run it locally inside your AI tool (Claude Desktop, Cursor, Hermes, etc.) and say "benchmark my models" to get TPS, TTFT, and latency comparisons across all your configured providers.

## 🚀 Quick Start

Install from source with Node.js 20 or newer (required by the patched dependency tree). The package is not currently published on npm, so use the built local entry point rather than `npx llm-speedtest-mcp`.

```bash
git clone https://github.com/thakoreh/llm-speedtest-mcp.git
cd llm-speedtest-mcp
npm ci
npm run build
```

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

For Claude Desktop/Cursor, set these in your shell profile or in the MCP server config's `env` field.

## 🛠️ MCP Tools

### `list_providers`
Shows which providers are configured (which env vars are set). **Does NOT show key values.**

### `benchmark_models`
Runs a standardized prompt through all detected providers. Measures:
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

These are built-in example model IDs, not a live availability catalog. Check the provider's current documentation before running; unavailable models return errors. The source's `PROVIDERS` table controls the accepted IDs.

| Provider | Env Variable | Models |
|----------|-------------|--------|
| OpenAI | `OPENAI_API_KEY` | gpt-4o, gpt-4o-mini |
| Anthropic | `ANTHROPIC_API_KEY` | claude-sonnet-4-20250514, claude-haiku-4-20250414 |
| Groq | `GROQ_API_KEY` | llama-3.3-70b-versatile, mixtral-8x7b-32768 |
| OpenRouter | `OPENROUTER_API_KEY` | deepseek/deepseek-r1, google/gemini-2.0-flash-001 |
| DeepSeek | `DEEPSEEK_API_KEY` | deepseek-chat, deepseek-reasoner |
| MiniMax | `MINIMAX_API_KEY` | MiniMax-M1, MiniMax-Text-01 |
| Zhipu/ZAI | `ZAI_API_KEY` or `ZHIPU_API_KEY` | glm-4-plus, glm-4-flash |
| Kimi/Moonshot | `KIMI_API_KEY` or `MOONSHOT_API_KEY` | moonshot-v1-8k, moonshot-v1-32k |

## 🔒 Trust & Security

### This tool is designed to be trusted.

- **This tool never sends your keys anywhere except directly to the AI provider you're testing.**
- **Zero telemetry. Zero analytics. Zero callhome.**
- **Under 500 lines of code — audit it yourself in 5 minutes.**
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
6. **Auditable** — The entire source is under 500 lines. Read every line in 5 minutes.

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
