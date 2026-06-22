/**
 * Full-page HTML layouts for the dashboard.
 * Includes the Chart.js + HTMX client-side script bundle.
 */

import type { SystemMetrics } from "../types";
import { esc, THEME_SCRIPT, STYLES, getHealthStatus } from "./helpers";
import { headerSection, metricsFragment, footerSection } from "./components";

/* ------------------------------------------------------------------ */
/*  Client-side script (Chart.js history + HTMX afterSwap hook)       */
/* ------------------------------------------------------------------ */

const CHART_SCRIPT = /* js */ `
(function() {
  const MAX = 60;

  /* ---- Badge update (reads data-health from #dashboard) ---- */
  function updateHealthBadge() {
    const dashboard = document.getElementById("dashboard");
    const badge = document.getElementById("_health_badge");
    if (!dashboard || !badge) return;

    const level = dashboard.dataset.health || "healthy";
    const cfg = {
      healthy:  { icon: "🟢", cls: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" },
      warning:  { icon: "🟡", cls: "bg-yellow-500/10  text-yellow-400  border-yellow-500/20"  },
      critical: { icon: "🔴", cls: "bg-red-500/10     text-red-400     border-red-500/20"     },
    };
    const c = cfg[level] || cfg.healthy;
    badge.className = "text-xs font-semibold px-2.5 py-1 rounded-md border " + c.cls;
    badge.textContent = c.icon + " " + level.toUpperCase();
  }

  /* ---- Countdown (element lives in header — never swapped) ---- */
  let _countdown = 5;
  const _countdownEl = document.getElementById("_next_refresh");
  setInterval(function() {
    _countdown = Math.max(0, _countdown - 1);
    if (_countdownEl) _countdownEl.textContent = _countdown + "s";
  }, 1000);

  /* ---- Chart helpers ---- */
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
              return this.chart.data.labels[i] || "";
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
          filter: (item) => item.dataset.label !== "__threshold__",
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
    if (bps >= 1024)    return (bps / 1024).toFixed(1)    + " KB/s";
    return bps.toFixed(0) + " B/s";
  }

  function nowLabel() {
    const d = new Date();
    return d.getHours().toString().padStart(2, "0") + ":" +
           d.getMinutes().toString().padStart(2, "0") + ":" +
           d.getSeconds().toString().padStart(2, "0");
  }

  /* ---- threshold dataset helper ---- */
  function thresholdDataset(data, value, color) {
    return {
      label: "__threshold__",
      data: data,
      borderColor: color || "rgba(248,113,113,0.35)",
      borderDash: [6, 4],
      borderWidth: 1.5,
      pointRadius: 0,
      fill: false,
      tension: 0,
      spanGaps: true,
    };
  }

  function initCharts() {
    const canvas    = document.getElementById("historyChart");
    const netCanvas = document.getElementById("netChart");
    if (!canvas || window._chartInited) return;
    window._chartInited = true;

    if (window.__chart)    { window.__chart.destroy();    window.__chart    = null; }
    if (window.__netChart) { window.__netChart.destroy(); window.__netChart = null; }

    /* history store — preserved across HTMX swaps */
    const history = window.__history || {
      labels:    new Array(MAX).fill(""),
      cpu:       new Array(MAX).fill(null),
      mem:       new Array(MAX).fill(null),
      rx:        new Array(MAX).fill(null),
      tx:        new Array(MAX).fill(null),
      threshold: new Array(MAX).fill(80),   /* constant 80% line for CPU/RAM chart */
    };
    window.__history = history;

    /* -- CPU/RAM chart -- */
    const ctx     = canvas.getContext("2d");
    const cpuGrad = makeGradient(ctx, "rgba(52,211,153,0.25)",  "rgba(52,211,153,0.01)");
    const memGrad = makeGradient(ctx, "rgba(96,165,250,0.25)",  "rgba(96,165,250,0.01)");

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
            tension: 0.4, fill: true, pointRadius: 0, borderWidth: 2, spanGaps: false,
          },
          {
            label: "RAM",
            data: history.mem,
            borderColor: "#60a5fa",
            backgroundColor: memGrad,
            tension: 0.4, fill: true, pointRadius: 0, borderWidth: 2, spanGaps: false,
          },
          thresholdDataset(history.threshold, 80, "rgba(248,113,113,0.35)"),
        ],
      },
      options: baseOptions("%", 100),
    });

    /* -- Network chart -- */
    if (netCanvas) {
      const nctx   = netCanvas.getContext("2d");
      const rxGrad = makeGradient(nctx, "rgba(52,211,153,0.20)",  "rgba(52,211,153,0.01)");
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
              tension: 0.4, fill: true, pointRadius: 0, borderWidth: 1.5, spanGaps: false,
            },
            {
              label: "TX",
              data: history.tx,
              borderColor: "#a78bfa",
              backgroundColor: txGrad,
              tension: 0.4, fill: true, pointRadius: 0, borderWidth: 1.5, spanGaps: false,
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
    h.labels.push(nowLabel());
    h.cpu.push(parseFloat(cpuEl.dataset.val)              || 0);
    h.mem.push(parseFloat(memEl.dataset.val)              || 0);
    h.rx.push(rxEl ? (parseFloat(rxEl.dataset.val) || 0) : null);
    h.tx.push(txEl ? (parseFloat(txEl.dataset.val) || 0) : null);
    h.threshold.push(80);

    if (h.labels.length > MAX) {
      h.labels.shift(); h.cpu.shift(); h.mem.shift();
      h.rx.shift();     h.tx.shift();  h.threshold.shift();
    }

    if (window.__chart)    window.__chart.update();
    if (window.__netChart) window.__netChart.update();
  }

  /* First load */
  document.addEventListener("DOMContentLoaded", function() {
    initCharts();
    updateHealthBadge();
    setTimeout(pushMetrics, 200);
  });

  /* Each HTMX refresh — canvas is replaced, rebuild charts on preserved history */
  document.body.addEventListener("htmx:afterSwap", function() {
    _countdown = 5;
    if (_countdownEl) _countdownEl.textContent = "5s";
    updateHealthBadge();
    window._chartInited = false;
    initCharts();
    setTimeout(pushMetrics, 100);
  });
})();`;

/* ------------------------------------------------------------------ */
/*  Full page layout                                                   */
/* ------------------------------------------------------------------ */

/** Full HTML page (served on first load). */
export function layout(metrics: SystemMetrics, port: number, version: string): string {
  const { hostname, platform, arch, uptime, temperature } = metrics;
  const health = getHealthStatus(metrics);

  return /* html */ `<!DOCTYPE html>
<html lang="en" class="dark">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>ServerMon — ${esc(hostname)}</title>
  <link rel="icon" type="image/svg+xml" href="/_dashboard/icon.svg"/>
  <script src="https://cdn.tailwindcss.com"></script>
  <script src="https://unpkg.com/htmx.org@2.0.4"></script>
  <script src="https://cdn.jsdelivr.net/npm/chart.js@4"></script>
  <script>${THEME_SCRIPT}</script>
  <style>${STYLES}</style>
</head>
<body class="bg-slate-950 text-slate-100 min-h-screen p-4 md:p-6">
  ${headerSection(hostname, platform, arch, uptime, temperature, port, version, health)}
  ${metricsFragment(metrics)}
  ${footerSection(hostname)}

<script>
${CHART_SCRIPT}
</script>
</body>
</html>`;
}

/* ------------------------------------------------------------------ */
/*  Error page                                                         */
/* ------------------------------------------------------------------ */

/** Minimal error page shown when metric collection fails on initial load. */
export function layoutError(message: string): string {
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
