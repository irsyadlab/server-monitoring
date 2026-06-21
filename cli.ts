#!/usr/bin/env bun
/**
 * Server Monitor — CLI entry point.
 * Uses @crustjs/core for command parsing and routing.
 */
import { main } from "./src/cli";

main().catch((err) => {
  console.error("❌ Fatal error:", err?.message ?? err);
  process.exit(1);
});
