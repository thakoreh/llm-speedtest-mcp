#!/usr/bin/env node

// llm-speedtest-mcp — Benchmark AI model inference speed via MCP
// Local execution, no telemetry. Keys are sent directly to the tested provider.

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

// ─── Provider Config ────────────────────────────────────────────────────────────

interface Provider {
  name: string;
  envKey: string;
  envKeyAlt?: string;
  baseUrl: string;
  models: string[];
  format: "openai" | "anthropic";
}

const PROVIDERS: Provider[] = [
  {
    name: "OpenAI",
    envKey: "OPENAI_API_KEY",
    baseUrl: "https://api.openai.com/v1",
    models: ["gpt-4o", "gpt-4o-mini"],
    format: "openai",
  },
  {
    name: "Anthropic",
    envKey: "ANTHROPIC_API_KEY",
    baseUrl: "https://api.anthropic.com",
    models: ["claude-sonnet-4-20250514", "claude-haiku-4-20250414"],
    format: "anthropic",
  },
  {
    name: "Groq",
    envKey: "GROQ_API_KEY",
    baseUrl: "https://api.groq.com/openai/v1",
    models: ["llama-3.3-70b-versatile", "mixtral-8x7b-32768"],
    format: "openai",
  },
  {
    name: "OpenRouter",
    envKey: "OPENROUTER_API_KEY",
    baseUrl: "https://openrouter.ai/api/v1",
    models: ["deepseek/deepseek-r1", "google/gemini-2.0-flash-001"],
    format: "openai",
  },
  {
    name: "DeepSeek",
    envKey: "DEEPSEEK_API_KEY",
    baseUrl: "https://api.deepseek.com/v1",
    models: ["deepseek-chat", "deepseek-reasoner"],
    format: "openai",
  },
  {
    name: "MiniMax",
    envKey: "MINIMAX_API_KEY",
    baseUrl: "https://api.minimax.chat/v1",
    models: ["MiniMax-M1", "MiniMax-Text-01"],
    format: "openai",
  },
  {
    name: "Zhipu/ZAI",
    envKey: "ZAI_API_KEY",
    envKeyAlt: "ZHIPU_API_KEY",
    baseUrl: "https://open.bigmodel.cn/api/paas/v4",
    models: ["glm-4-plus", "glm-4-flash"],
    format: "openai",
  },
  {
    name: "Kimi/Moonshot",
    envKey: "KIMI_API_KEY",
    envKeyAlt: "MOONSHOT_API_KEY",
    baseUrl: "https://api.moonshot.cn/v1",
    models: ["moonshot-v1-8k", "moonshot-v1-32k"],
    format: "openai",
  },
];

const DEFAULT_PROMPT =
  "Explain the concept of recursion in programming using a simple analogy. Keep your explanation clear and concise, suitable for a beginner. Use a real-world example to illustrate how recursion works step by step.";
const MAX_TOKENS = 256;

// ─── Helpers ─────────────────────────────────────────────────────────────────────

function getKey(provider: Provider): string | undefined {
  return process.env[provider.envKey]?.trim() || (provider.envKeyAlt ? process.env[provider.envKeyAlt]?.trim() : undefined);
}

class ProviderError extends Error {}
const timeoutSchema = z.number().int().min(1).max(300000).optional()
  .describe("Per-model request timeout in milliseconds (default 60000, maximum 300000)");

interface BenchmarkResult {
  provider: string;
  model: string;
  ttft: number;
  tps: number;
  totalMs: number;
  tokens: number;
  error?: string;
}

function estimateTokens(text: string): number {
  // Rough estimate: ~4 chars per token for English text
  return Math.max(1, Math.round(text.length / 4));
}

// Network chunks do not necessarily end at an SSE data-line boundary.
async function* readDataLines(response: Response): AsyncGenerator<string> {
  if (!response.body) throw new ProviderError("Provider response has no streaming body");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let pending = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      pending += done ? decoder.decode() : decoder.decode(value, { stream: true });
      let end: number;
      while ((end = pending.indexOf("\n")) >= 0) {
        const line = pending.slice(0, end).trim();
        pending = pending.slice(end + 1);
        if (line.startsWith("data:")) yield line.slice(5).trimStart();
      }
      if (done) {
        const line = pending.trim();
        if (line.startsWith("data:")) yield line.slice(5).trimStart();
        break;
      }
    }
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

// ─── Streaming Benchmark: OpenAI-compatible ──────────────────────────────────────

async function benchmarkOpenAI(
  provider: Provider,
  model: string,
  prompt: string,
  apiKey: string,
  signal: AbortSignal
): Promise<BenchmarkResult> {
  const url = `${provider.baseUrl}/chat/completions`;
  const startTime = performance.now();
  let ttft: number | null = null;
  let fullText = "";
  let completed = false;

  const response = await fetch(url, {
    signal,
    redirect: "error",
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [{ role: "user", content: prompt }],
      max_tokens: MAX_TOKENS,
      stream: true,
    }),
  });

  if (!response.ok) {
    await response.body?.cancel();
    throw new ProviderError(`HTTP ${response.status}`);
  }

  for await (const data of readDataLines(response)) {
    if (data === "[DONE]") { completed = true; break; }
    let parsed;
    try { parsed = JSON.parse(data); } catch { continue; }
    if (parsed.error) throw new ProviderError("Provider stream returned an error");
    const delta = parsed.choices?.[0]?.delta?.content;
    if (typeof delta === "string" && delta) {
      if (ttft === null) ttft = performance.now() - startTime;
      fullText += delta;
    }
  }

  if (ttft === null || !fullText) throw new ProviderError("No text content received from provider");
  if (!completed) throw new ProviderError("Provider stream ended early");
  const totalMs = performance.now() - startTime;
  const tokens = estimateTokens(fullText);
  const generationMs = totalMs - ttft;

  return {
    provider: provider.name,
    model,
    ttft: Math.round(ttft),
    tps: generationMs > 0 ? Math.round((tokens / generationMs) * 1000 * 100) / 100 : 0,
    totalMs: Math.round(totalMs),
    tokens,
  };
}

// ─── Streaming Benchmark: Anthropic ──────────────────────────────────────────────

async function benchmarkAnthropic(
  provider: Provider,
  model: string,
  prompt: string,
  apiKey: string,
  signal: AbortSignal
): Promise<BenchmarkResult> {
  const url = `${provider.baseUrl}/v1/messages`;
  const startTime = performance.now();
  let ttft: number | null = null;
  let fullText = "";
  let completed = false;

  const response = await fetch(url, {
    signal,
    redirect: "error",
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true",
    },
    body: JSON.stringify({
      model,
      max_tokens: MAX_TOKENS,
      messages: [{ role: "user", content: prompt }],
      stream: true,
    }),
  });

  if (!response.ok) {
    await response.body?.cancel();
    throw new ProviderError(`HTTP ${response.status}`);
  }

  for await (const data of readDataLines(response)) {
    if (data === "[DONE]") { completed = true; break; }
    let parsed;
    try { parsed = JSON.parse(data); } catch { continue; }
    if (parsed.type === "error" || parsed.error) throw new ProviderError("Provider stream returned an error");
    if (parsed.type === "message_stop") { completed = true; break; }
    if (parsed.type === "content_block_delta" && typeof parsed.delta?.text === "string" && parsed.delta.text) {
      if (ttft === null) ttft = performance.now() - startTime;
      fullText += parsed.delta.text;
    }
  }

  if (ttft === null || !fullText) throw new ProviderError("No text content received from provider");
  if (!completed) throw new ProviderError("Provider stream ended early");
  const totalMs = performance.now() - startTime;
  const tokens = estimateTokens(fullText);
  const generationMs = totalMs - ttft;

  return {
    provider: provider.name,
    model,
    ttft: Math.round(ttft),
    tps: generationMs > 0 ? Math.round((tokens / generationMs) * 1000 * 100) / 100 : 0,
    totalMs: Math.round(totalMs),
    tokens,
  };
}

// ─── Run One Benchmark ───────────────────────────────────────────────────────────

async function runBenchmark(provider: Provider, model: string, prompt: string, signal: AbortSignal, timeoutMs = 60000): Promise<BenchmarkResult> {
  const apiKey = getKey(provider)!;
  const controller = new AbortController();
  const cancel = () => controller.abort(new ProviderError("Request cancelled"));
  signal.addEventListener("abort", cancel, { once: true });
  if (signal.aborted) cancel();
  const timer = setTimeout(() => controller.abort(new ProviderError("Request timed out")), timeoutMs);
  try {
    return await (provider.format === "anthropic"
      ? benchmarkAnthropic(provider, model, prompt, apiKey, controller.signal)
      : benchmarkOpenAI(provider, model, prompt, apiKey, controller.signal));
  } catch (err) {
    return {
      provider: provider.name,
      model,
      ttft: 0,
      tps: 0,
      totalMs: 0,
      tokens: 0,
      // Provider bodies and network exceptions can echo credentials. Only expose our own messages.
      error: controller.signal.aborted ? controller.signal.reason.message
        : err instanceof ProviderError ? err.message : "Provider request failed",
    };
  } finally {
    clearTimeout(timer);
    signal.removeEventListener("abort", cancel);
  }
}

// ─── Format Results ──────────────────────────────────────────────────────────────

function formatResults(results: BenchmarkResult[]): string {
  const lines: string[] = [];
  lines.push("╔══════════════════════════════════════════════════════════════════════════╗");
  lines.push("║                    LLM SPEED TEST RESULTS                                ║");
  lines.push("╠══════════════════════════════════════════════════════════════════════════╣");
  lines.push("║ Provider         │ Model                       │ TTFT   │ TPS    │ Total  │ Tokens ║");
  lines.push("║                  │                             │ (ms)   │ (t/s)  │ (ms)   │        ║");
  lines.push("╠══════════════════════════════════════════════════════════════════════════╣");

  for (const r of results) {
    if (r.error) {
      lines.push(`║ ${r.provider.padEnd(16)} │ ${r.model.padEnd(27)} │ ERROR: ${r.error.slice(0, 30)}`.padEnd(77) + "║");
    } else {
      const row =
        `║ ${r.provider.padEnd(16)} │ ${r.model.padEnd(27)} │ ${String(r.ttft).padStart(6)} │ ${String(r.tps).padStart(6)} │ ${String(r.totalMs).padStart(6)} │ ${String(r.tokens).padStart(6)} ║`;
      lines.push(row);
    }
  }

  lines.push("╚══════════════════════════════════════════════════════════════════════════╝");

  // Sort by TPS descending and show winner
  const valid = results.filter((r) => !r.error && r.tps > 0);
  if (valid.length > 0) {
    valid.sort((a, b) => b.tps - a.tps);
    lines.push("");
    lines.push(`🏆 Fastest: ${valid[0].provider} / ${valid[0].model} at ${valid[0].tps} tokens/sec`);
    const fastestTtft = [...valid].sort((a, b) => a.ttft - b.ttft);
    lines.push(`⚡ Lowest TTFT: ${fastestTtft[0].provider} / ${fastestTtft[0].model} at ${fastestTtft[0].ttft}ms`);
  }

  return lines.join("\n");
}

// ─── MCP Server ──────────────────────────────────────────────────────────────────

const server = new McpServer({
  name: "llm-speedtest-mcp",
  version: "0.1.0",
});

server.tool("list_providers", "Show which AI providers are configured (detects API keys from environment variables). Does NOT show key values.", {}, async () => {
  const lines: string[] = ["Configured Providers:", ""];

  for (const p of PROVIDERS) {
    const hasKey = !!getKey(p);
    const status = hasKey ? "✅ Configured" : "❌ Not configured";
    const keyHint = hasKey ? `(${p.envKey} is set)` : `(set ${p.envKey}${p.envKeyAlt ? ` or ${p.envKeyAlt}` : ""})`;
    lines.push(`  ${status} ${p.name} ${keyHint}`);
    if (hasKey) {
      lines.push(`    Models: ${p.models.join(", ")}`);
    }
  }

  const configured = PROVIDERS.filter((p) => !!getKey(p));
  lines.push("");
  lines.push(`${configured.length}/${PROVIDERS.length} providers configured.`);

  return { content: [{ type: "text", text: lines.join("\n") }] };
});

server.tool(
  "benchmark_models",
  "Run a speed benchmark across all configured AI providers. Measures TTFT (time to first token), TPS (tokens/sec), total latency, and token count for each model.",
  {
    prompt: z.string().optional().describe("Custom prompt to use (defaults to the standardized benchmark prompt)"),
    timeout_ms: timeoutSchema,
  },
  async ({ prompt, timeout_ms }, extra) => {
    const p = prompt || DEFAULT_PROMPT;
    const configured = PROVIDERS.filter((p) => !!getKey(p));

    if (configured.length === 0) {
      return {
        isError: true,
        content: [
          {
            type: "text",
            text: "No providers configured. Set at least one API key environment variable (e.g., OPENAI_API_KEY, ANTHROPIC_API_KEY).",
          },
        ],
      };
    }

    // Run all models across all configured providers
    const allBenchmarks: Promise<BenchmarkResult>[] = [];
    for (const provider of configured) {
      for (const model of provider.models) {
        allBenchmarks.push(runBenchmark(provider, model, p, extra.signal, timeout_ms));
      }
    }

    const results = await Promise.all(allBenchmarks);
    const text = formatResults(results);

    return { isError: results.every(result => !!result.error), content: [{ type: "text", text }] };
  }
);

server.tool(
  "benchmark_model",
  "Benchmark a single specific model with a custom prompt. Provide provider name and model.",
  {
    provider: z.string().describe("Provider name (e.g., 'OpenAI', 'Anthropic', 'Groq', 'OpenRouter', 'DeepSeek', 'MiniMax', 'Zhipu/ZAI', 'Kimi/Moonshot')"),
    model: z.string().describe("Model ID (e.g., 'gpt-4o', 'claude-sonnet-4-20250514')"),
    prompt: z.string().optional().describe("Custom prompt (defaults to standardized benchmark prompt)"),
    timeout_ms: timeoutSchema,
  },
  async ({ provider: providerName, model, prompt, timeout_ms }, extra) => {
    const p = prompt || DEFAULT_PROMPT;
    const provider = PROVIDERS.find((pr) => pr.name.toLowerCase() === providerName.toLowerCase());

    if (!provider) {
      const names = PROVIDERS.map((p) => p.name).join(", ");
      return { isError: true, content: [{ type: "text", text: `Unknown provider "${providerName}". Available: ${names}` }] };
    }

    if (!getKey(provider)) {
      return { isError: true, content: [{ type: "text", text: `Provider ${provider.name} is not configured. Set ${provider.envKey}.` }] };
    }

    if (!provider.models.includes(model)) {
      return {
        isError: true,
        content: [
          { type: "text", text: `Model "${model}" not found for ${provider.name}. Available: ${provider.models.join(", ")}` },
        ],
      };
    }

    const result = await runBenchmark(provider, model, p, extra.signal, timeout_ms);
    const text = formatResults([result]);
    return { isError: !!result.error, content: [{ type: "text", text }] };
  }
);

// ─── Start ───────────────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  if (args.length) {
    if (args.length === 1 && ["--help", "-h"].includes(args[0])) {
      console.log("Usage: llm-speedtest-mcp [--help | --version]\nStarts an MCP server over stdio. Configure provider API keys in the client environment.");
      return;
    }
    if (args.length === 1 && args[0] === "--version") { console.log("0.1.0"); return; }
    console.error("Unknown arguments. Use --help for usage.");
    process.exitCode = 1;
    return;
  }
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error("Failed to start llm-speedtest-mcp:", err);
  process.exit(1);
});
