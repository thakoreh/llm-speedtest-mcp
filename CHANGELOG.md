# Changelog

## Unreleased

- Remove the stale model whitelist: single-model benchmarks accept explicitly supplied provider model IDs.
- **Configuration migration:** bulk runs now require per-provider `*_MODELS` lists; a key alone no longer starts requests. Lists are bounded/deduplicated and all selections preflight before network calls.
- **Configuration migration:** MiniMax, ZAI and Kimi require explicit `*_REGION=global|cn`; only fixed official endpoints are allowed, with no redirects or fallback between regions.
- Map output-budget parameters to current provider request formats, expose a bounded `max_tokens` option, and support explicitly configured, provider-specific thinking modes without assuming every model supports them.
- Add offline MCP regressions for modern model IDs, request shapes, region routing, invalid configuration, token limits and zero-request preflight failures.
- No tag, package or release is published by this change; v0.1.1 remains the existing stable source release.

## 0.1.1

- Reject provider stream errors and truncated output instead of reporting partial benchmarks as winners.
- Abort provider requests on MCP cancellation or timeout; expose a per-model `timeout_ms` option.
- Keep provider-echoed credentials out of errors and report failed MCP calls correctly.
- Add command help/version output and document the Node 20 minimum required by patched dependencies.
- Declare Zod directly and update compatible dependencies.
- Test fresh MCP sessions and production-only tarball consumers across Windows/Linux and Node 20/22/24.

Distribution remains source-only through GitHub. This release is not published on npm.

## 0.1.0

- Initial source implementation.
