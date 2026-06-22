/**
 * servermon dashboard — lightweight web UI for monitoring system metrics.
 *
 * Architecture:
 *   startDashboard(port)
 *     └─ createDashboardApp(port)   ← Elysia routes
 *          ├─ GET  /                  ← full page layout
 *          ├─ GET  /_dashboard/metrics ← HTMX fragment (auto-refresh)
 *          └─ GET  /_dashboard/health ← JSON health check
 *
 * Templates live in src/views/ (pure functions, zero Elysia imports).
 *
 * Dependencies: elysia, @elysiajs/html
 */

import { Elysia } from "elysia";
import { html } from "@elysiajs/html";
import { collectMetrics } from "../monitor";
import { layout, layoutError, metricsFragment } from "../views";
import type { SystemMetrics } from "../types";
import pkg from "../../package.json";
import { readFileSync } from "fs";
import { join } from "path";

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const APP_VERSION = pkg.version;

// Resolve icon relative to this file so it works from any cwd
const ICON_SVG = (() => {
  try {
    return readFileSync(join(import.meta.dir, "../../assets/icon.svg"), "utf-8");
  } catch {
    return null;
  }
})();

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

async function getMetrics(): Promise<SystemMetrics> {
  const m = await collectMetrics();
  if (m.cpu.usagePercent > 100) m.cpu.usagePercent = 100;
  return m;
}

/* ------------------------------------------------------------------ */
/*  Elysia application                                                 */
/* ------------------------------------------------------------------ */

function createDashboardApp(port: number): Elysia {
  return new Elysia()
    .use(html())
    .get("/", async () => {
      try {
        const metrics = await getMetrics();
        return layout(metrics, port, APP_VERSION);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return layoutError(`Failed to collect metrics: ${msg}`);
      }
    })
    .get("/_dashboard/icon.svg", () => {
      if (!ICON_SVG) return new Response("Not found", { status: 404 });
      return new Response(ICON_SVG, {
        headers: { "Content-Type": "image/svg+xml", "Cache-Control": "public, max-age=86400" },
      });
    })
    .get("/_dashboard/metrics", async () => {
      try {
        const metrics = await getMetrics();
        return metricsFragment(metrics);
      } catch {
        return `<div id="dashboard" class="max-w-6xl mx-auto text-center py-12">
          <p class="text-red-400">⚠️ Failed to refresh metrics. Retrying in 5s…</p>
        </div>`;
      }
    })
    .get("/_dashboard/health", () => ({
      status: "ok",
      uptime: Math.floor(process.uptime()),
      version: APP_VERSION,
    }));
}

/* ------------------------------------------------------------------ */
/*  Public entry point                                                 */
/* ------------------------------------------------------------------ */

/**
 * Start the embedded web dashboard.
 *
 * Usage: `servermon dashboard --port 3456`
 *
 * Opens an HTMX + Elysia dashboard showing real-time system metrics.
 */
export async function startDashboard(port: number): Promise<void> {
  const app = createDashboardApp(port);

  console.log();
  console.log(`  🌐  Dashboard starting at  http://localhost:${port}`);
  console.log(`  ⏱   Auto-refresh every 5s  (HTMX + Chart.js)`);
  console.log(`  ⌨   Press Ctrl+C to stop`);
  console.log();

  app.listen(port, () => {
    console.log(`  ✅  ServerMon Dashboard — http://localhost:${port}`);
    console.log();
  });
}
