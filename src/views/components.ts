/**
 * Dashboard HTML components — pure template functions, no Elysia imports.
 * Each function returns an HTML string ready to be embedded in a page or HTMX fragment.
 */

import { formatBytes, formatRate, formatUptime } from "../monitor";
import type { DiskInfo, SystemMetrics } from "../types";
import { esc, barColor, pctColor, NET_BAR_SCALE, getHealthStatus } from "./helpers";
import type { HealthStatus } from "./helpers";

/* ------------------------------------------------------------------ */
/*  Alert banner                                                       */
/* ------------------------------------------------------------------ */

/** Renders a warning/critical banner when thresholds are exceeded. Hidden when healthy. */
export function alertBanner(health: HealthStatus): string {
  if (health.alerts.length === 0) return "";

  const isCritical = health.level === "critical";
  const border = isCritical ? "border-red-800/50" : "border-yellow-800/50";
  const bg = isCritical ? "bg-red-950/40" : "bg-yellow-950/40";
  const text = isCritical ? "text-red-300" : "text-yellow-300";
  const label = isCritical ? "CRITICAL" : "WARNING";
  const icon = isCritical ? "🚨" : "⚠️";

  return /* html */ `
<div class="${bg} border ${border} rounded-xl p-3 mb-4 flex items-center gap-3">
  <span class="text-lg flex-shrink-0">${icon}</span>
  <p class="text-sm ${text}">
    <span class="font-semibold">${label}:</span>
    <span class="ml-1 opacity-90">${health.alerts.join(" · ")}</span>
  </p>
</div>`;
}

/* ------------------------------------------------------------------ */
/*  Header                                                             */
/* ------------------------------------------------------------------ */

export function headerSection(
  hostname: string,
  platform: string,
  arch: string,
  uptime: number,
  temperature: number | null,
  port: number,
  version: string,
  health: HealthStatus
): string {
  const tempHtml =
    temperature != null
      ? `<span class="text-sm font-medium ${temperature > 75 ? "text-red-400" : temperature > 50 ? "text-yellow-400" : "text-green-400"}">${temperature.toFixed(1)}°C</span>`
      : '<span class="text-sm text-slate-500">—°C</span>';

  const tempIcon =
    temperature != null ? (temperature > 75 ? "🔴" : temperature > 50 ? "🟡" : "🟢") : "⚪";

  const badgeCls: Record<string, string> = {
    healthy: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
    warning: "bg-yellow-500/10 text-yellow-400 border-yellow-500/20",
    critical: "bg-red-500/10 text-red-400 border-red-500/20",
  };
  const badgeIcon: Record<string, string> = {
    healthy: "🟢",
    warning: "🟡",
    critical: "🔴",
  };

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
    <div class="flex items-center gap-3 text-xs text-slate-500">
      <span id="_health_badge" class="text-xs font-semibold px-2.5 py-1 rounded-md border ${badgeCls[health.level]}">
        ${badgeIcon[health.level]} ${health.level.toUpperCase()}
      </span>
      <span class="flex items-center gap-1.5">
        <span class="relative flex h-2.5 w-2.5">
          <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
          <span class="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
        </span>
        live · <span id="_next_refresh" class="tabular-nums text-slate-400">5s</span>
      </span>
      <span class="hidden sm:inline-flex items-center gap-1.5 bg-slate-800 rounded-md px-2.5 py-1 text-slate-400 font-mono">
        :${port}
      </span>
    </div>
  </div>
</header>`;
}

/* ------------------------------------------------------------------ */
/*  CPU card                                                           */
/* ------------------------------------------------------------------ */

export function cpuCard(cpu: SystemMetrics["cpu"]): string {
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

/* ------------------------------------------------------------------ */
/*  Memory card                                                        */
/* ------------------------------------------------------------------ */

export function memCard(mem: SystemMetrics["memory"]): string {
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

/* ------------------------------------------------------------------ */
/*  Disk section                                                       */
/* ------------------------------------------------------------------ */

export function diskSection(disks: DiskInfo[]): string {
  if (disks.length === 0) return "";

  const rows = disks
    .map((d) => {
      const bar = barColor(d.usagePercent, "disk");
      const txt = pctColor(d.usagePercent);
      return /* html */ `
    <tr class="hover:bg-slate-800/30 transition-colors">
      <td class="py-1.5 pr-3 text-slate-300 font-medium">${esc(d.mount)}</td>
      <td class="py-1.5 pr-3 text-right text-slate-400 text-xs tabular-nums">${formatBytes(d.used)} / ${formatBytes(d.total)}</td>
      <td class="py-1.5 pr-3 text-right text-xs tabular-nums text-emerald-500/70">${formatBytes(d.available)}</td>
      <td class="py-1.5 w-32">
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
          <th class="pb-2 pr-3 text-right font-medium uppercase tracking-wider text-[10px]">Used / Total</th>
          <th class="pb-2 pr-3 text-right font-medium uppercase tracking-wider text-[10px] text-emerald-600">Free</th>
          <th class="pb-2 w-32"></th>
          <th class="pb-2 pl-2 text-right font-medium uppercase tracking-wider text-[10px]">%</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  </div>
</div>`;
}

/* ------------------------------------------------------------------ */
/*  Network card                                                       */
/* ------------------------------------------------------------------ */

export function netCard(net: SystemMetrics["network"]): string {
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

/* ------------------------------------------------------------------ */
/*  Top processes section                                              */
/* ------------------------------------------------------------------ */

export function procSection(procs: SystemMetrics["topProcs"], memTotal: number): string {
  if (procs.length === 0) return "";

  const rows = procs
    .map((p, i) => {
      const highlight = i === 0 ? "text-yellow-400" : "text-slate-200";
      const memAbsolute = formatBytes(Math.round((p.memPercent / 100) * memTotal));
      return /* html */ `
    <tr class="hover:bg-slate-800/30 transition-colors">
      <td class="py-1.5 pr-3 text-slate-500 tabular-nums">${p.pid}</td>
      <td class="py-1.5 pr-3 ${highlight} truncate max-w-[160px]" title="${esc(p.name)}">${esc(p.name)}</td>
      <td class="py-1.5 pr-3 text-right text-slate-300 tabular-nums">${p.cpuPercent.toFixed(1)}%</td>
      <td class="py-1.5 pr-2 text-right text-slate-400 tabular-nums text-[10px]">${memAbsolute}</td>
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
          <th class="pb-2 pr-2 text-right font-medium uppercase tracking-wider text-[10px]">Mem</th>
          <th class="pb-2 text-right font-medium uppercase tracking-wider text-[10px]">%</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  </div>
</div>`;
}

/* ------------------------------------------------------------------ */
/*  Chart canvas shell                                                 */
/* ------------------------------------------------------------------ */

export function chartSection(): string {
  return /* html */ `
<div class="bg-gradient-to-br from-slate-900 to-slate-900/80 border border-slate-800 rounded-xl p-4 md:col-span-2 lg:col-span-6 card-fade" id="_chart_wrapper">
  <div class="grid grid-cols-1 lg:grid-cols-2 gap-x-6 gap-y-4">
    <div>
      <div class="flex items-center justify-between mb-3">
        <h3 class="text-xs font-semibold uppercase tracking-wider text-slate-400">CPU &amp; RAM</h3>
        <div class="flex items-center gap-3 text-[10px] text-slate-500">
          <span class="flex items-center gap-1"><span class="inline-block w-2 h-2 rounded-full bg-emerald-400"></span>CPU</span>
          <span class="flex items-center gap-1"><span class="inline-block w-2 h-2 rounded-full bg-blue-400"></span>RAM</span>
          <span class="flex items-center gap-1"><span class="inline-block w-4 border-t border-dashed border-red-400/60"></span>80%</span>
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

/* ------------------------------------------------------------------ */
/*  Footer                                                             */
/* ------------------------------------------------------------------ */

export function footerSection(hostname: string): string {
  return /* html */ `
<footer class="max-w-6xl mx-auto mt-6 pb-6 text-center text-[10px] text-slate-600 space-y-0.5">
  <p>ServerMon · ${esc(hostname)}</p>
  <p>pressing <kbd class="bg-slate-800 px-1 rounded text-slate-400">Ctrl+C</kbd> in the terminal stops this dashboard</p>
  <p class="mt-1">made by <a href="https://github.com/irsyadulibad" target="_blank" rel="noopener noreferrer" class="text-slate-500 hover:text-slate-300 transition-colors">irsyadulibad</a></p>
</footer>`;
}

/* ------------------------------------------------------------------ */
/*  HTMX fragment (auto-refreshed every 5s)                           */
/* ------------------------------------------------------------------ */

/**
 * HTMX-swappable dashboard body.
 * Wraps the metric grid + alert banner. Carries health state as data-attributes
 * so the static header badge can be updated by client-side JS on each swap.
 */
export function metricsFragment(metrics: SystemMetrics): string {
  const health = getHealthStatus(metrics);

  return /* html */ `
<div id="dashboard"
     data-health="${health.level}"
     data-alerts="${esc(health.alerts.join(" · "))}"
     hx-get="/_dashboard/metrics" hx-trigger="every 5s" hx-swap="outerHTML" hx-target="#dashboard">
  <div class="max-w-6xl mx-auto">
    ${alertBanner(health)}
    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-4">
      ${cpuCard(metrics.cpu)}
      ${memCard(metrics.memory)}
      ${netCard(metrics.network)}
      ${chartSection()}
      ${diskSection(metrics.disks)}
      ${procSection(metrics.topProcs, metrics.memory.total)}
    </div>
  </div>
</div>`;
}
