#!/bin/bash
# Wrapper that runs @playwright/mcp with --isolated flag
# Used by playwright-parallel-mcp as custom backend
exec npx @playwright/mcp@latest --isolated
