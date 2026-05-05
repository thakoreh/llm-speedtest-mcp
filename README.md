# LLM Speedtest MCP

**Benchmark AI model inference speed — like speedtest.net, but for LLMs.**

Run it locally inside your AI tool (Claude Desktop, Cursor, Hermes, etc.) and say "benchmark my models" to get TPS, TTFT, and latency comparisons across all your configured providers.

## 🚀 Quick Start

```bash
# Install globally
npm install -g llm-speedtest-mcp

# Or use directly with npx
npx llm-speedtest-mcp
```

### Configure in Claude Desktop

Add to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "llm-speedtest": {
      "command": "npx",
      "args": ["-y", "llm-speedtest-mcp"]
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
      "command": "npx",
      "args": ["-y", "llm-speedtest-mcp"]
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

## 📊 Example Output

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
4. **No dependencies** beyond the MCP SDK — No axios, no analytics packages, no tracking.
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

## 📄 License

MIT © Hiren Thakore
