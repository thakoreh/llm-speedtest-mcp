# Security Audit — llm-speedtest-mcp

## Overview

`llm-speedtest-mcp` is an MCP (Model Context Protocol) server that benchmarks AI model inference speed. This document provides a complete security analysis of the tool.

## Data Flow

```
1. User launches AI tool (Claude Desktop, Cursor, Hermes, etc.)
2. AI tool starts llm-speedtest-mcp via MCP protocol (stdio transport)
3. User invokes a benchmark tool via the AI tool
4. llm-speedtest-mcp reads API keys from environment variables
5. llm-speedtest-mcp makes direct HTTPS streaming requests to provider APIs
6. llm-speedtest-mcp measures timing (TTFT, TPS, latency)
7. llm-speedtest-mcp returns formatted results to the AI tool via MCP
8. AI tool displays results to the user
```

**That's the entire data flow. No steps are skipped or omitted.**

## API Key Handling

### How Keys Are Read
- Keys are read via `process.env[ENV_VAR_NAME]` only
- Supported env vars: `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GROQ_API_KEY`, `OPENROUTER_API_KEY`, `DEEPSEEK_API_KEY`, `MINIMAX_API_KEY`, `ZAI_API_KEY`/`ZHIPU_API_KEY`, `KIMI_API_KEY`/`MOONSHOT_API_KEY`
- No alternative key input mechanism exists
- No UI, no prompts, no config files for keys

### How Keys Are Used
- Keys are passed as HTTP headers in `fetch()` calls to the respective provider API
- OpenAI-compatible: `Authorization: Bearer ${key}`
- Anthropic: `x-api-key: ${key}`
- Keys remain in the server's environment for its lifetime and are read when a request runs
- Keys are never written to disk, logs, console, or any output

### How Keys Are NOT Used
- ❌ Never logged (not even partial/masked)
- ❌ Never stored to filesystem
- ❌ Never sent to any server other than the intended provider API
- ❌ Never included in MCP tool responses
- ❌ Never included in error messages
- ❌ Never passed to third-party services

## Network Connections

The tool makes HTTPS connections **only** to the following endpoints:

| Provider | Base URL |
|----------|----------|
| OpenAI | `https://api.openai.com/v1/chat/completions` |
| Anthropic | `https://api.anthropic.com/v1/messages` |
| Groq | `https://api.groq.com/openai/v1/chat/completions` |
| OpenRouter | `https://openrouter.ai/api/v1/chat/completions` |
| DeepSeek | `https://api.deepseek.com/v1/chat/completions` |
| MiniMax | `https://api.minimax.chat/v1/chat/completions` |
| Zhipu/ZAI | `https://open.bigmodel.cn/api/paas/v4/chat/completions` |
| Kimi/Moonshot | `https://api.moonshot.cn/v1/chat/completions` |

**No other outbound connections are made.** No telemetry, no analytics, no crash reporting, no update checks.

## File System Access

- ❌ No file reads (except the Node.js runtime loading the script itself)
- ❌ No file writes (no database, no logs, no temp files)
- ❌ No config file parsing
- The only I/O is stdio (MCP transport) and network (API calls)

## Dependency Audit

### Runtime Dependencies
| Package | Purpose | Verified Safe |
|---------|---------|---------------|
| `@modelcontextprotocol/sdk` | MCP protocol implementation | ✅ Official MCP SDK by Anthropic |
| `zod` | MCP tool argument schemas | Directly imported runtime dependency |

### Dev Dependencies
| Package | Purpose |
|---------|---------|
| `typescript` | Compile-time only |
| `@types/node` | Compile-time only |

**Total direct runtime dependencies: 2** (the MCP SDK and Zod). Their transitive dependencies are recorded in `package-lock.json`.

No analytics, no tracking, no heavy frameworks. The entire runtime dependency tree is minimal.

## Threat Model

### In Scope
| Threat | Mitigation | Status |
|--------|------------|--------|
| API key exfiltration via logging | Keys never appear in any log output | ✅ Mitigated |
| API key exfiltration via network | Only connections are to provider APIs | ✅ Mitigated |
| API key exfiltration via filesystem | No file I/O operations | ✅ Mitigated |
| Supply chain attack via dependencies | Only 1 runtime dep (official MCP SDK) | ✅ Minimized |
| Malicious prompt injection | Benchmark prompts are user-controlled or fixed; no system-level effects | ✅ Mitigated |
| Data collection/telemetry | Zero network calls except to user's chosen providers | ✅ Mitigated |

### Out of Scope
- **Compromised provider APIs** — We cannot control what OpenAI/Anthropic/etc. do with keys sent to their APIs. This is inherent to using any AI tool.
- **Compromised local environment** — If the user's machine is compromised, env vars are already accessible to malware. This tool adds no additional attack surface.
- **MCP transport security** — The MCP stdio transport runs locally. If the local machine is compromised, the transport is already insecure regardless of this tool.

## Code Audit Guide

The entire source is under 500 lines in a single file (`src/index.ts`). To audit:

1. **Check imports** - MCP SDK and Zod.
2. **Check network calls** — All `fetch()` calls use hardcoded URLs from the `PROVIDERS` array.
3. **Check key usage** — Search for `getKey()` and `apiKey` — only used in HTTP headers.
4. **Check file I/O** — Search for `fs`, `readFile`, `writeFile` — none exist.
5. **Check logging** — Search for `console.log`, `console.error` — only startup/error, never with keys.

## Summary

This tool is designed with a **zero-trust-except-the-user** model:

- Trusts the user's environment variables (they're already on the machine)
- Trusts the provider APIs (the user chose to use them)
- Trusts nothing and no one else
- No data leaves the machine except API calls the user explicitly initiated
- The codebase is small enough to verify all of these claims in 5 minutes
