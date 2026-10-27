# Changelog

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
