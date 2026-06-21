#!/usr/bin/env bun
/**
 * Server Monitor — CLI wrapper.
 * Just delegates to src/cli/index.ts.
 */
import { main } from "./src/cli";

main().catch((err) => {
  console.error("❌ Fatal error:", err?.message ?? err);
  process.exit(1);
});
