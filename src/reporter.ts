import { formatBytes, formatRate, formatUptime, type SystemMetrics } from "./monitor";

// HTML escape
function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// Bar chart with inline colored blocks
function bar(percent: number, w = 10): string {
  const filled = Math.min(w, Math.max(0, Math.round((percent / 100) * w)));
  const empty = w - filled;
  const color = percent > 80 ? "🔴" : percent > 50 ? "🟡" : "🟢";
  return color + " " + "▰".repeat(filled) + "▱".repeat(empty);
}

function pad(n: number, dp = 1): string {
  return n.toFixed(dp).padStart(5);
}

// Overall health
function healthTag(m: SystemMetrics): string {
  const d = m.disks.length ? Math.max(...m.disks.map((x) => x.usagePercent)) : 0;
  if (m.cpu.usagePercent > 85 || m.memory.usagePercent > 95 || d > 95) return "🚨 CRITICAL";
  if (m.cpu.usagePercent > 70 || m.memory.usagePercent > 85 || d > 85) return "⚠️ WARNING";
  return "✅ HEALTHY";
}

export function formatReportHTML(m: SystemMetrics, serverName?: string): string {
  const now = new Date().toLocaleString("id-ID", {
    timeZone: "Asia/Jakarta",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  const tempStr = m.temperature !== null ? `  🌡 ${m.temperature.toFixed(0)}°C` : "";
  const nameTag = serverName ? `  [${esc(serverName)}]` : "";

  // ── Header ──
  const header = [
    `<b>🖥  ${esc(m.hostname)}</b>${nameTag}  —  ${healthTag(m)}`,
    `📅 ${esc(now)}  │  ⏱ ${esc(formatUptime(m.uptime))}${tempStr}`,
    `🐧 ${esc(m.platform)} ${esc(m.arch)}  │  ${esc(m.cpu.model)}  (${m.cpu.cores}c)`,
  ];

  // ── CPU card ──
  const cpu = [
    `<b>💻 CPU</b>  <code>${pad(m.cpu.usagePercent)}%</code>  ${bar(m.cpu.usagePercent)}`,
    `   Load: <code>${m.cpu.loadAvg["1min"].toFixed(2)}</code> / <code>${m.cpu.loadAvg["5min"].toFixed(2)}</code> / <code>${m.cpu.loadAvg["15min"].toFixed(2)}</code>`,
  ];

  // ── Memory card ──
  const mem = [
    `<b>🧠 RAM</b>   <code>${pad(m.memory.usagePercent)}%</code>  ${bar(m.memory.usagePercent)}`,
    `   <code>${esc(formatBytes(m.memory.used))}</code> / <code>${esc(formatBytes(m.memory.total))}</code>`,
    m.memory.swapTotal > 0
      ? `   Swap: <code>${esc(formatBytes(m.memory.swapUsed))}</code> / <code>${esc(formatBytes(m.memory.swapTotal))}</code>  (${m.memory.swapUsagePercent.toFixed(1)}%)`
      : "",
  ].filter(Boolean);

  // ── Disk card ──
  const disks = [`<b>💾 DISK</b>`];
  for (const d of m.disks) {
    disks.push(
      `   <code>${esc(d.mount)}</code>  <code>${pad(d.usagePercent, 0)}%</code>   ${bar(d.usagePercent)}`
    );
    disks.push(
      `    └ <code>${esc(formatBytes(d.used))}</code> / <code>${esc(formatBytes(d.total))}</code>`
    );
  }

  // ── Network card ──
  const net = [
    `<b>🌐 NET</b>`,
    `   ↓ <code>${esc(formatRate(m.network.rxRate))}</code>   ↑ <code>${esc(formatRate(m.network.txRate))}</code>`,
  ];

  // ── Top processes ──
  const procLines: string[] = [];
  if (m.topProcs.length > 0) {
    procLines.push(`<b>📊 TOP PROCESSES</b>`);
    for (const p of m.topProcs) {
      procLines.push(
        `   <code>${String(p.pid).padStart(6)}</code>  ${esc(p.name.slice(0, 15).padEnd(15))}  CPU <code>${p.cpuPercent.toFixed(1).padStart(5)}%</code>  MEM <code>${p.memPercent.toFixed(1).padStart(5)}%</code>`
      );
    }
  }

  // ── Alerts ──
  const alerts: string[] = [];
  if (m.cpu.usagePercent > 85) alerts.push(`🔴 CPU tinggi: ${m.cpu.usagePercent.toFixed(1)}%`);
  if (m.memory.usagePercent > 90)
    alerts.push(`🔴 RAM hampir penuh: ${m.memory.usagePercent.toFixed(1)}%`);
  if (m.memory.swapUsagePercent > 50)
    alerts.push(`🟡 Swap tinggi: ${m.memory.swapUsagePercent.toFixed(1)}%`);
  for (const d of m.disks) {
    if (d.usagePercent > 90)
      alerts.push(`🔴 Disk <code>${esc(d.mount)}</code>: ${d.usagePercent}%`);
  }

  if (alerts.length > 0) {
    alerts.unshift(`<b>⚠️ ALERTS</b>`);
  }

  return [
    ...header,
    "",
    ...cpu,
    "",
    ...mem,
    "",
    ...disks,
    "",
    ...net,
    ...(procLines.length ? ["", ...procLines] : []),
    ...(alerts.length ? ["", ...alerts] : []),
    "",
    alerts.length === 0 ? "✨ All systems normal" : "",
  ]
    .filter(Boolean)
    .join("\n");
}

async function sendMessage(botToken: string, chatId: string, text: string): Promise<Response> {
  return fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: "HTML",
      disable_web_page_preview: true,
    }),
  });
}

export async function sendReport(
  botToken: string,
  chatId: string,
  serverName?: string
): Promise<boolean> {
  if (!botToken || !chatId) {
    console.error("❌ TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID are required.");
    return false;
  }

  const m = await import("./monitor").then((x) => x.collectMetrics());
  const report = formatReportHTML(m, serverName);

  // Telegram 4096 char limit — split on double newlines
  if (report.length > 4000) {
    const chunks = report.split("\n\n");
    let current = "";
    for (const chunk of chunks) {
      if (current.length + chunk.length + 2 > 4000) {
        const r = await sendMessage(botToken, chatId, current);
        if (!r.ok) {
          console.error(`❌ Telegram: ${r.status} ${await r.text()}`);
          return false;
        }
        current = chunk;
      } else {
        current += (current ? "\n\n" : "") + chunk;
      }
    }
    if (current) {
      const r = await sendMessage(botToken, chatId, current);
      if (!r.ok) {
        console.error(`❌ Telegram: ${r.status} ${await r.text()}`);
        return false;
      }
    }
    console.log("📤 Report sent (chunked)");
    return true;
  }

  const resp = await sendMessage(botToken, chatId, report);
  if (!resp.ok) {
    console.error(`❌ Telegram: ${resp.status} ${await resp.text()}`);
    return false;
  }
  console.log("📤 Report sent to Telegram");
  return true;
}
