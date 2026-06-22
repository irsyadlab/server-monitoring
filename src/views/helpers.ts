/**
 * Shared constants, utility helpers, and health status logic for dashboard templates.
 * No external dependencies — pure functions only.
 */

import type { SystemMetrics } from "../types";

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

/** 10 MB/s = 100% bar width */
export const NET_BAR_SCALE = 10 * 1024 * 1024;

export const THEME_SCRIPT = /* js */ `
tailwindcss.config = {
  darkMode: "class",
  theme: {
    extend: {
      fontFamily: { mono: ['ui-monospace', 'SF Mono', 'Cascadia Code', 'monospace'] },
    },
  },
};`;

export const STYLES = /* css */ `
body { font-family: ui-monospace, "SF Mono", "Cascadia Code", monospace; }
.progress-bar { transition: width 0.6s ease; }
.card-fade { transition: opacity 0.3s ease; }
.glow-green { box-shadow: 0 0 12px rgba(52,211,153,0.15); }
.glow-blue  { box-shadow: 0 0 12px rgba(96,165,250,0.15); }
.glow-red   { box-shadow: 0 0 12px rgba(248,113,113,0.15); }
@media (prefers-color-scheme: dark) { body { background: #020617; } }`;

/* ------------------------------------------------------------------ */
/*  Utility helpers                                                    */
/* ------------------------------------------------------------------ */

/** HTML-escape a string to safely embed in attributes and text nodes. */
export function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Semantic bar colour based on utilisation percentage. */
export function barColor(pct: number, severity: "cpu" | "mem" | "disk" = "disk"): string {
  if (severity === "cpu")
    return pct > 80 ? "bg-red-500" : pct > 50 ? "bg-yellow-500" : "bg-emerald-500";
  if (severity === "mem")
    return pct > 80 ? "bg-red-500" : pct > 50 ? "bg-yellow-500" : "bg-blue-500";
  return pct > 90
    ? "bg-red-500"
    : pct > 75
      ? "bg-orange-500"
      : pct > 50
        ? "bg-yellow-500"
        : "bg-blue-500";
}

/** Text colour class for a percentage label. */
export function pctColor(pct: number): string {
  return pct > 80 ? "text-red-400" : pct > 50 ? "text-yellow-400" : "text-slate-400";
}

/* ------------------------------------------------------------------ */
/*  Health status                                                      */
/* ------------------------------------------------------------------ */

export type HealthLevel = "healthy" | "warning" | "critical";

export interface HealthStatus {
  level: HealthLevel;
  alerts: string[];
}

/**
 * Derive overall health level and alert messages from a metrics snapshot.
 * Thresholds mirror the Telegram reporter alerts.
 */
export function getHealthStatus(metrics: SystemMetrics): HealthStatus {
  const alerts: string[] = [];
  let level: HealthLevel = "healthy";

  if (metrics.cpu.usagePercent > 85) {
    alerts.push(`CPU ${metrics.cpu.usagePercent.toFixed(1)}%`);
    if (level === "healthy") level = "warning";
  }
  if (metrics.memory.usagePercent > 90) {
    alerts.push(`RAM ${metrics.memory.usagePercent.toFixed(1)}%`);
    level = "critical";
  }
  for (const disk of metrics.disks) {
    if (disk.usagePercent > 90) {
      alerts.push(`Disk ${disk.mount} ${disk.usagePercent}%`);
      level = "critical";
    }
  }
  if (metrics.memory.swapTotal > 0 && metrics.memory.swapUsagePercent > 50) {
    alerts.push(`Swap ${metrics.memory.swapUsagePercent.toFixed(1)}%`);
    if (level === "healthy") level = "warning";
  }

  return { level, alerts };
}
