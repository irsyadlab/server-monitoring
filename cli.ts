#!/usr/bin/env bun
/**
 * Server Monitor — CLI entry point.
 * Uses @crustjs/core for command parsing and routing.
 */

/**
 * Polyfill for Bun globals that are unavailable in compiled (bun build --compile) binaries.
 * @crustjs/style calls Bun.stripANSI and Bun.color — both missing from the embedded runtime.
 */
if (typeof Bun !== "undefined") {
  if (!Bun.stripANSI) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (Bun as any).stripANSI = (str: string) => {
      return str.replace(/\x1B\[[\d;]*[A-Za-z]/g, "").replace(/\x1B[[\]()#;?]*(?:\d+(?:;\d[^\x07]*)?(?:\x07|[\x1B\\]))/g, ""); // eslint-disable-line no-control-regex
    };
  }
  if (!Bun.color) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (Bun as any).color = (_color: string, _format: string) => "";
  }
}

import { main } from "./src/cli";

main().catch((err) => {
  console.error("❌ Fatal error:", err?.message ?? err);
  process.exit(1);
});
