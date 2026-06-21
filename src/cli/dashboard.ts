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
 * Templates layer (pure functions, zero Elysia imports):
 *   layout()        → full HTML page shell
 *   metricsFragment → HTMX-swappable dashboard grid
 *   cpuCard()       → CPU usage card
 *   memCard()       → RAM usage card
 *   diskSection()   → disk usage table
 *   netCard()       → network RX/TX card
 *   procSection()   → top processes table
 *   chartSection()  → Chart.js canvas shell
 *   headerSection() → host info + temperature row
 *
 * Dependencies: elysia, @elysiajs/html, tailwindcss (CDN), htmx (CDN), chart.js (CDN)
 */

import { Elysia } from "elysia";
import { html } from "@elysiajs/html";
import { collectMetrics, formatBytes, formatRate, formatUptime } from "../monitor";
import type { DiskInfo, SystemMetrics } from "../types";
import pkg from "../../package.json";

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const APP_VERSION = pkg.version;
const NET_BAR_SCALE = 10 * 1024 * 1024; // 10 MB/s = 100% bar width

/* ------------------------------------------------------------------ */
/*  CSS / Theme                                                        */
/* ------------------------------------------------------------------ */

const THEME_SCRIPT = /* js */ `
tailwindcss.config = {
  darkMode: "class",
  theme: {
    extend: {
      fontFamily: { mono: ['ui-monospace', 'SF Mono', 'Cascadia Code', 'monospace'] },
    },
  },
};`;

const STYLES = /* css */ `
body { font-family: ui-monospace, "SF Mono", "Cascadia Code", monospace; }
.progress-bar { transition: width 0.6s ease; }
.card-fade { transition: opacity 0.3s ease; }
.glow-green { box-shadow: 0 0 12px rgba(52,211,153,0.15); }
.glow-blue  { box-shadow: 0 0 12px rgba(96,165,250,0.15); }
.glow-red   { box-shadow: 0 0 12px rgba(248,113,113,0.15); }
@media (prefers-color-scheme: dark) { body { background: #020617; } }`;

/* ------------------------------------------------------------------ */
/*  Utility helpers (shared by all template functions)                 */
/* ------------------------------------------------------------------ */

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Semantic bar colour based on utilisation percentage. */
function barColor(pct: number, severity: "cpu" | "mem" | "disk" = "disk"): string {
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

/** Text colour for percentage label. */
function pctColor(pct: number): string {
  return pct > 80 ? "text-red-400" : pct > 50 ? "text-yellow-400" : "text-slate-400";
}

/* ------------------------------------------------------------------ */
/*  Template functions (pure, testable, no side-effects)                */
/* ------------------------------------------------------------------ */

function headerSection(
  hostname: string,
  platform: string,
  arch: string,
  uptime: number,
  temperature: number | null,
  port: number,
  version: string
): string {
  const tempHtml =
    temperature != null
      ? `<span class="text-sm font-medium ${temperature > 75 ? "text-red-400" : temperature > 50 ? "text-yellow-400" : "text-green-400"}">${temperature.toFixed(1)}°C</span>`
      : '<span class="text-sm text-slate-500">—°C</span>';

  const tempIcon =
    temperature != null ? (temperature > 75 ? "🔴" : temperature > 50 ? "🟡" : "🟢") : "⚪";

  return /* html */ `
<header class="max-w-6xl mx-auto mb-6">
  <div class="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-slate-900/50 border border-slate-800 rounded-xl p-4">
    <div class="flex items-center gap-3">
      <div class="w-10 h-10 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-lg font-bold text-emerald-400 glow-green">◉</div>
      <div>
        <h1 class="text-lg font-bold tracking-tight text-slate-100">
          ServerMon
          <span class="text-xs font-normal text-slate-500 ml-1.5">v${version}</span>
        </h1>
        <p class="text-xs text-slate-400 mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5">
          <span class="font-semibold text-slate-300">${esc(hostname)}</span>
          <span class="text-slate-600">·</span>
          <span>${platform}/${arch}</span>
          <span class="text-slate-600">·</span>
          <span>up ${formatUptime(uptime)}</span>
          <span class="text-slate-600">·</span>
          <span>${tempIcon} ${tempHtml}</span>
        </p>
      </div>
    </div>
    <div class="flex items-center gap-4 text-xs text-slate-500">
      <span class="flex items-center gap-1.5">
        <span class="relative flex h-2.5 w-2.5">
          <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
          <span class="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
        </span>
        live
      </span>
      <span class="hidden sm:inline-flex items-center gap-1.5 bg-slate-800 rounded-md px-2.5 py-1 text-slate-400 font-mono">
        :${port}
      </span>
    </div>
  </div>
</header>`;
}

function cpuCard(cpu: SystemMetrics["cpu"]): string {
  const pct = cpu.usagePercent;
  const color = barColor(pct, "cpu");
  const glow = pct > 80 ? "glow-red" : pct > 50 ? "" : "glow-green";
  return /* html */ `
<div class="bg-gradient-to-br from-slate-900 to-slate-900/80 border border-slate-800 rounded-xl p-4 lg:col-span-2 ${glow} card-fade">
  <div class="flex items-center justify-between mb-3">
    <h3 class="text-xs font-semibold uppercase tracking-wider text-slate-400">CPU</h3>
    <span class="text-[10px] font-mono text-slate-500">${cpu.cores} cores</span>
  </div>
  <div class="flex items-end gap-2 mb-3">
    <span class="text-4xl font-bold tracking-tight tabular-nums text-slate-100" id="_cpu_val" data-val="${pct}">${pct.toFixed(1)}</span>
    <span class="text-sm text-slate-400 mb-1">%</span>
  </div>
  <div class="w-full h-2.5 bg-slate-700/80 rounded-full mb-3 overflow-hidden">
    <div class="${color} progress-bar h-full rounded-full" style="width:${Math.min(pct, 100)}%"></div>
  </div>
  <div class="text-xs text-slate-500 space-y-0.5">
    <p class="truncate" title="${esc(cpu.model)}">${esc(cpu.model)}</p>
    <p>load: <span class="tabular-nums">${cpu.loadAvg["1min"].toFixed(2)}</span> / <span class="tabular-nums">${cpu.loadAvg["5min"].toFixed(2)}</span> / <span class="tabular-nums">${cpu.loadAvg["15min"].toFixed(2)}</span></p>
  </div>
</div>`;
}

function memCard(mem: SystemMetrics["memory"]): string {
  const pct = mem.usagePercent;
  const color = barColor(pct, "mem");
  const glow = pct > 80 ? "glow-red" : "";
  return /* html */ `
<div class="bg-gradient-to-br from-slate-900 to-slate-900/80 border border-slate-800 rounded-xl p-4 lg:col-span-2 ${glow} card-fade">
  <div class="flex items-center justify-between mb-3">
    <h3 class="text-xs font-semibold uppercase tracking-wider text-slate-400">Memory</h3>
    <span class="text-[10px] font-mono text-slate-500">${formatBytes(mem.total)}</span>
  </div>
  <div class="flex items-end gap-2 mb-3">
    <span class="text-4xl font-bold tracking-tight tabular-nums text-slate-100" id="_mem_val" data-val="${pct}">${pct.toFixed(1)}</span>
    <span class="text-sm text-slate-400 mb-1">%</span>
  </div>
  <div class="w-full h-2.5 bg-slate-700/80 rounded-full mb-3 overflow-hidden">
    <div class="${color} progress-bar h-full rounded-full" style="width:${Math.min(pct, 100)}%"></div>
  </div>
  <div class="text-xs text-slate-500 space-y-0.5">
    <p><span class="text-slate-300">used</span> ${formatBytes(mem.used)} <span class="text-slate-600">·</span> <span class="text-slate-300">free</span> ${formatBytes(mem.free)}</p>
    ${
      mem.swapTotal > 0
        ? `<p>swap ${formatBytes(mem.swapUsed)} / ${formatBytes(mem.swapTotal)} <span class="${pctColor(mem.swapUsagePercent)} tabular-nums">(${mem.swapUsagePercent.toFixed(1)}%)</span></p>`
        : '<p class="text-slate-600">swap n/a</p>'
    }
  </div>
</div>`;
}

function diskSection(disks: DiskInfo[]): string {
  if (disks.length === 0) return "";

  const rows = disks
    .map((d) => {
      const bar = barColor(d.usagePercent, "disk");
      const txt = pctColor(d.usagePercent);
      return /* html */ `
    <tr class="hover:bg-slate-800/30 transition-colors">
      <td class="py-1.5 pr-3 text-slate-300 font-medium">${esc(d.mount)}</td>
      <td class="py-1.5 pr-3 text-right text-slate-400 text-xs tabular-nums">${formatBytes(d.used)} / ${formatBytes(d.total)}</td>
      <td class="py-1.5 w-36">
        <div class="w-full bg-slate-700/60 rounded-full h-2 overflow-hidden">
          <div class="${bar} progress-bar h-full rounded-full" style="width:${Math.min(d.usagePercent, 100)}%"></div>
        </div>
      </td>
      <td class="py-1.5 pl-2 text-right text-xs font-semibold tabular-nums ${txt}">${d.usagePercent}%</td>
    </tr>`;
    })
    .join("");

  return /* html */ `
<div class="bg-gradient-to-br from-slate-900 to-slate-900/80 border border-slate-800 rounded-xl p-4 md:col-span-2 lg:col-span-3 card-fade">
  <h3 class="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-3">Disks</h3>
  <div class="overflow-x-auto">
    <table class="w-full text-xs">
      <thead>
        <tr class="text-slate-500 text-left border-b border-slate-800">
          <th class="pb-2 pr-3 font-medium uppercase tracking-wider text-[10px]">Mount</th>
          <th class="pb-2 pr-3 text-right font-medium uppercase tracking-wider text-[10px]">Usage</th>
          <th class="pb-2 w-36"></th>
          <th class="pb-2 pl-2 text-right font-medium uppercase tracking-wider text-[10px]">%</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  </div>
</div>`;
}

function netCard(net: SystemMetrics["network"]): string {
  const rxWidth = Math.min((net.rxRate / NET_BAR_SCALE) * 100, 100);
  const txWidth = Math.min((net.txRate / NET_BAR_SCALE) * 100, 100);

  return /* html */ `
<div class="bg-gradient-to-br from-slate-900 to-slate-900/80 border border-slate-800 rounded-xl p-4 md:col-span-2 lg:col-span-2 glow-blue card-fade">
  <span id="_rx_val" data-val="${net.rxRate}" class="hidden"></span>
  <span id="_tx_val" data-val="${net.txRate}" class="hidden"></span>
  <h3 class="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-3">Network</h3>
  <div class="space-y-4">
    <div>
      <div class="flex justify-between text-xs mb-1.5">
        <span class="text-slate-400 flex items-center gap-1.5"><span class="text-emerald-400">↓</span> RX</span>
        <span class="text-emerald-400 font-semibold tabular-nums">${formatRate(net.rxRate)}</span>
      </div>
      <div class="w-full bg-slate-700/60 rounded-full h-1.5 overflow-hidden">
        <div class="bg-emerald-500 h-full rounded-full transition-all duration-500" style="width:${rxWidth}%"></div>
      </div>
    </div>
    <div>
      <div class="flex justify-between text-xs mb-1.5">
        <span class="text-slate-400 flex items-center gap-1.5"><span class="text-blue-400">↑</span> TX</span>
        <span class="text-blue-400 font-semibold tabular-nums">${formatRate(net.txRate)}</span>
      </div>
      <div class="w-full bg-slate-700/60 rounded-full h-1.5 overflow-hidden">
        <div class="bg-blue-500 h-full rounded-full transition-all duration-500" style="width:${txWidth}%"></div>
      </div>
    </div>
    <div class="text-xs text-slate-500 pt-2 border-t border-slate-800 flex justify-between">
      <span>total ↓ ${formatBytes(net.rxTotal)}</span>
      <span>total ↑ ${formatBytes(net.txTotal)}</span>
    </div>
  </div>
</div>`;
}

function procSection(procs: SystemMetrics["topProcs"]): string {
  if (procs.length === 0) return "";

  const rows = procs
    .map((p, i) => {
      const highlight = i === 0 ? "text-yellow-400" : "text-slate-200";
      return /* html */ `
    <tr class="hover:bg-slate-800/30 transition-colors">
      <td class="py-1.5 pr-3 text-slate-500 tabular-nums">${p.pid}</td>
      <td class="py-1.5 pr-3 ${highlight} truncate max-w-[200px]" title="${esc(p.name)}">${esc(p.name)}</td>
      <td class="py-1.5 pr-3 text-right text-slate-300 tabular-nums">${p.cpuPercent.toFixed(1)}%</td>
      <td class="py-1.5 text-right text-slate-300 tabular-nums">${p.memPercent.toFixed(1)}%</td>
    </tr>`;
    })
    .join("");

  return /* html */ `
<div class="bg-gradient-to-br from-slate-900 to-slate-900/80 border border-slate-800 rounded-xl p-4 md:col-span-2 lg:col-span-3 card-fade">
  <div class="flex items-center justify-between mb-3">
    <h3 class="text-xs font-semibold uppercase tracking-wider text-slate-400">Top Processes</h3>
    <span class="text-[10px] text-slate-500">by CPU</span>
  </div>
  <div class="overflow-x-auto">
    <table class="w-full text-xs">
      <thead>
        <tr class="text-slate-500 text-left border-b border-slate-800">
          <th class="pb-2 pr-3 font-medium uppercase tracking-wider text-[10px]">PID</th>
          <th class="pb-2 pr-3 font-medium uppercase tracking-wider text-[10px]">Name</th>
          <th class="pb-2 pr-3 text-right font-medium uppercase tracking-wider text-[10px]">CPU</th>
          <th class="pb-2 text-right font-medium uppercase tracking-wider text-[10px]">MEM</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  </div>
</div>`;
}

function chartSection(): string {
  return /* html */ `
<div class="bg-gradient-to-br from-slate-900 to-slate-900/80 border border-slate-800 rounded-xl p-4 md:col-span-2 lg:col-span-6 card-fade" id="_chart_wrapper">
  <div class="grid grid-cols-1 lg:grid-cols-2 gap-x-6 gap-y-4">
    <div>
      <div class="flex items-center justify-between mb-3">
        <h3 class="text-xs font-semibold uppercase tracking-wider text-slate-400">CPU &amp; RAM</h3>
        <div class="flex items-center gap-3 text-[10px] text-slate-500">
          <span class="flex items-center gap-1"><span class="inline-block w-2 h-2 rounded-full bg-emerald-400"></span>CPU</span>
          <span class="flex items-center gap-1"><span class="inline-block w-2 h-2 rounded-full bg-blue-400"></span>RAM</span>
        </div>
      </div>
      <div class="h-48">
        <canvas id="historyChart"></canvas>
      </div>
    </div>
    <div>
      <div class="flex items-center justify-between mb-3">
        <h3 class="text-xs font-semibold uppercase tracking-wider text-slate-400">Network I/O</h3>
        <div class="flex items-center gap-3 text-[10px] text-slate-500">
          <span class="flex items-center gap-1"><span class="inline-block w-2 h-2 rounded-full bg-emerald-400"></span>RX</span>
          <span class="flex items-center gap-1"><span class="inline-block w-2 h-2 rounded-full bg-violet-400"></span>TX</span>
        </div>
      </div>
      <div class="h-48">
        <canvas id="netChart"></canvas>
      </div>
    </div>
  </div>
  <p class="text-[10px] text-slate-600 text-right mt-2">60 samples · ≈5 min rolling window</p>
</div>`;
}

function footerSection(hostname: string): string {
  return /* html */ `
<footer class="max-w-6xl mx-auto mt-6 pb-6 text-center text-[10px] text-slate-600 space-y-0.5">
  <p>ServerMon · ${esc(hostname)}</p>
  <p>pressing <kbd class="bg-slate-800 px-1 rounded text-slate-400">Ctrl+C</kbd> in the terminal stops this dashboard</p>
</footer>`;
}

/** HTMX-swappable dashboard body (replaces #dashboard container). */
function metricsFragment(metrics: SystemMetrics): string {
  return /* html */ `
<div id="dashboard" class="max-w-6xl mx-auto grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-4"
     hx-get="/_dashboard/metrics" hx-trigger="every 5s" hx-swap="outerHTML" hx-target="#dashboard">
  ${cpuCard(metrics.cpu)}
  ${memCard(metrics.memory)}
  ${netCard(metrics.network)}
  ${chartSection()}
  ${diskSection(metrics.disks)}
  ${procSection(metrics.topProcs)}
</div>`;
}

/** Full HTML page (served on first load). */
function layout(metrics: SystemMetrics, port: number, version: string): string {
  const { hostname, platform, arch, uptime, temperature } = metrics;

  return /* html */ `<!DOCTYPE html>
<html lang="en" class="dark">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>ServerMon — ${esc(hostname)}</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <script src="https://unpkg.com/htmx.org@2.0.4"></script>
  <script src="https://cdn.jsdelivr.net/npm/chart.js@4"></script>
  <script>${THEME_SCRIPT}</script>
  <style>${STYLES}</style>
</head>
<body class="bg-slate-950 text-slate-100 min-h-screen p-4 md:p-6">
  ${headerSection(hostname, platform, arch, uptime, temperature, port, version)}
  ${metricsFragment(metrics)}
  ${footerSection(hostname)}

<script>
(function() {
  const MAX = 60;

  function makeGradient(ctx, colorTop, colorBot) {
    const g = ctx.createLinearGradient(0, 0, 0, ctx.canvas.clientHeight || 160);
    g.addColorStop(0, colorTop);
    g.addColorStop(1, colorBot);
    return g;
  }

  function baseOptions(yLabel, yMax) {
    return {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 400, easing: "easeOutQuart" },
      interaction: { mode: "index", intersect: false },
      scales: {
        x: {
          display: true,
          grid: { display: false },
          ticks: {
            color: "#475569",
            maxTicksLimit: 7,
            maxRotation: 0,
            callback: function(val, i) {
              const lbl = this.chart.data.labels[i];
              return lbl || "";
            },
          },
          border: { display: false },
        },
        y: {
          min: 0, max: yMax,
          grid: { color: "rgba(148,163,184,0.05)", drawBorder: false },
          ticks: {
            color: "#475569",
            maxTicksLimit: 5,
            callback: (v) => yLabel === "%" ? v + "%" : v,
          },
          border: { display: false },
        },
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: "rgba(15,23,42,0.95)",
          borderColor: "rgba(148,163,184,0.12)",
          borderWidth: 1,
          titleColor: "#94a3b8",
          bodyColor: "#e2e8f0",
          padding: 10,
          callbacks: {
            label: function(ctx) {
              const val = ctx.parsed.y;
              if (yLabel === "%") return " " + ctx.dataset.label + ": " + val.toFixed(1) + "%";
              return " " + ctx.dataset.label + ": " + formatBytesRate(val);
            },
          },
        },
      },
    };
  }

  function formatBytesRate(bps) {
    if (bps >= 1048576) return (bps / 1048576).toFixed(1) + " MB/s";
    if (bps >= 1024) return (bps / 1024).toFixed(1) + " KB/s";
    return bps.toFixed(0) + " B/s";
  }

  function nowLabel() {
    const d = new Date();
    return d.getHours().toString().padStart(2,"0") + ":" + d.getMinutes().toString().padStart(2,"0") + ":" + d.getSeconds().toString().padStart(2,"0");
  }

  function initCharts() {
    const canvas = document.getElementById("historyChart");
    const netCanvas = document.getElementById("netChart");
    if (!canvas || window._chartInited) return;
    window._chartInited = true;

    /* Destroy stale chart instances bound to the now-replaced canvases. */
    if (window.__chart) { window.__chart.destroy(); window.__chart = null; }
    if (window.__netChart) { window.__netChart.destroy(); window.__netChart = null; }

    /* -- history data store (preserve across HTMX swaps) -- */
    const history = window.__history || {
      labels: new Array(MAX).fill(""),
      cpu: new Array(MAX).fill(null),
      mem: new Array(MAX).fill(null),
      rx:  new Array(MAX).fill(null),
      tx:  new Array(MAX).fill(null),
    };
    window.__history = history;

    /* -- CPU/RAM chart -- */
    const ctx = canvas.getContext("2d");
    const cpuGrad = makeGradient(ctx, "rgba(52,211,153,0.25)", "rgba(52,211,153,0.01)");
    const memGrad = makeGradient(ctx, "rgba(96,165,250,0.25)", "rgba(96,165,250,0.01)");

    window.__chart = new Chart(ctx, {
      type: "line",
      data: {
        labels: history.labels,
        datasets: [
          {
            label: "CPU",
            data: history.cpu,
            borderColor: "#34d399",
            backgroundColor: cpuGrad,
            tension: 0.4, fill: true, pointRadius: 0,
            borderWidth: 2,
            spanGaps: false,
          },
          {
            label: "RAM",
            data: history.mem,
            borderColor: "#60a5fa",
            backgroundColor: memGrad,
            tension: 0.4, fill: true, pointRadius: 0,
            borderWidth: 2,
            spanGaps: false,
          },
        ],
      },
      options: baseOptions("%", 100),
    });

    /* -- Network chart -- */
    if (netCanvas) {
      const nctx = netCanvas.getContext("2d");
      const rxGrad = makeGradient(nctx, "rgba(52,211,153,0.20)", "rgba(52,211,153,0.01)");
      const txGrad = makeGradient(nctx, "rgba(167,139,250,0.20)", "rgba(167,139,250,0.01)");

      window.__netChart = new Chart(nctx, {
        type: "line",
        data: {
          labels: history.labels,
          datasets: [
            {
              label: "RX",
              data: history.rx,
              borderColor: "#34d399",
              backgroundColor: rxGrad,
              tension: 0.4, fill: true, pointRadius: 0,
              borderWidth: 1.5,
              spanGaps: false,
            },
            {
              label: "TX",
              data: history.tx,
              borderColor: "#a78bfa",
              backgroundColor: txGrad,
              tension: 0.4, fill: true, pointRadius: 0,
              borderWidth: 1.5,
              spanGaps: false,
            },
          ],
        },
        options: (function() {
          const o = baseOptions("bytes", undefined);
          o.scales.y.ticks.callback = (v) => formatBytesRate(v);
          return o;
        })(),
      });
    }
  }

  function pushMetrics() {
    const cpuEl = document.getElementById("_cpu_val");
    const memEl = document.getElementById("_mem_val");
    const rxEl  = document.getElementById("_rx_val");
    const txEl  = document.getElementById("_tx_val");
    if (!cpuEl || !memEl || !window.__history) return;

    const h = window.__history;
    const label = nowLabel();

    h.labels.push(label);
    h.cpu.push(parseFloat(cpuEl.dataset.val) || 0);
    h.mem.push(parseFloat(memEl.dataset.val) || 0);
    h.rx.push(rxEl  ? (parseFloat(rxEl.dataset.val)  || 0) : null);
    h.tx.push(txEl  ? (parseFloat(txEl.dataset.val)  || 0) : null);

    if (h.labels.length > MAX) { h.labels.shift(); h.cpu.shift(); h.mem.shift(); h.rx.shift(); h.tx.shift(); }

    if (window.__chart) window.__chart.update();
    if (window.__netChart) window.__netChart.update();
  }

  /* First load: build charts and seed the first sample. */
  document.addEventListener("DOMContentLoaded", function() {
    initCharts();
    setTimeout(pushMetrics, 200);
  });

  /* Each HTMX refresh replaces the canvas — rebuild on the preserved
     history and append exactly one fresh sample. This is the only push
     path, so samples map 1:1 to the 5s refresh (no stale/duplicate data). */
  document.body.addEventListener("htmx:afterSwap", function() {
    window._chartInited = false;
    initCharts();
    setTimeout(pushMetrics, 100);
  });
})();
</script>
</body>
</html>`;
}

/* ------------------------------------------------------------------ */
/*  Application layer                                                  */
/* ------------------------------------------------------------------ */

async function getMetrics(): Promise<SystemMetrics> {
  const m = await collectMetrics();
  if (m.cpu.usagePercent > 100) m.cpu.usagePercent = 100;
  return m;
}

function createDashboardApp(port: number): Elysia {
  return new Elysia()
    .use(html())
    .get("/", async () => {
      try {
        const metrics = await getMetrics();
        return layout(metrics, port, APP_VERSION);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return layoutError(`Failed to collect metrics: ${esc(msg)}`);
      }
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

function layoutError(message: string): string {
  return /* html */ `<!DOCTYPE html>
<html lang="en" class="dark">
<head><meta charset="UTF-8"><title>ServerMon — Error</title>
<script src="https://cdn.tailwindcss.com"></script></head>
<body class="bg-slate-950 text-slate-100 min-h-screen flex items-center justify-center p-8">
  <div class="bg-slate-900 border border-red-800/50 rounded-xl p-8 max-w-lg text-center">
    <div class="text-4xl mb-4">⚠️</div>
    <h1 class="text-lg font-bold mb-2">Dashboard Error</h1>
    <p class="text-sm text-slate-400 mb-4">${message}</p>
    <a href="/" class="text-sm text-emerald-400 hover:underline">Retry</a>
  </div>
</body></html>`;
}

/* ------------------------------------------------------------------ */
/*  Public entry point                                                  */
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
