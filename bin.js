#!/usr/bin/env bun
/**
 * Server Monitor — npm-compatible binary wrapper.
 * Bun runs .ts files natively, but npm requires bin entries to be .js.
 */
import { main } from "./src/cli";

main().catch((err) => {
  console.error("❌ Fatal error:", err?.message ?? err);
  process.exit(1);
});
