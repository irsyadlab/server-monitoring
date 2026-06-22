import type { SystemMetrics } from "../types";
import { collectMetrics, formatBytes, formatRate, formatUptime } from "../monitor";

/* ------------------------------------------------------------------ */
/*  Thresholds — single source of truth for both healthTag and alerts  */
/* ------------------------------------------------------------------ */

const T = {
  cpu: { warn: 70, critical: 85 },
  ram: { warn: 80, critical: 90 },
  disk: { warn: 80, critical: 90 },
  swap: { warn: 50 },
};

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function bar(percent: number, w = 10): string {
  const filled = Math.min(w, Math.max(0, Math.round((percent / 100) * w)));
  const empty = w - filled;
  const dot = percent >= T.disk.critical ? "🔴" : percent >= T.disk.warn ? "🟡" : "🟢";
  return dot + " " + "▰".repeat(filled) + "▱".repeat(empty);
}

function healthTag(m: SystemMetrics): string {
  const maxDisk = m.disks.length ? Math.max(...m.disks.map((d) => d.usagePercent)) : 0;

  if (
    m.cpu.usagePercent > T.cpu.critical ||
    m.memory.usagePercent > T.ram.critical ||
    maxDisk > T.disk.critical
  )
    return "🚨 CRITICAL";

  if (
    m.cpu.usagePercent > T.cpu.warn ||
    m.memory.usagePercent > T.ram.warn ||
    maxDisk > T.disk.warn ||
    m.memory.swapUsagePercent > T.swap.warn
  )
    return "⚠️ WARNING";

  return "✅ HEALTHY";
}

/* ------------------------------------------------------------------ */
/*  Formatter                                                          */
/* ------------------------------------------------------------------ */

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
  const title = serverName ? esc(serverName) : esc(m.hostname);
  const subtitle = serverName
    ? `${esc(m.hostname)}  ·  ${esc(now)}  ·  up ${esc(formatUptime(m.uptime))}${tempStr}`
    : `${esc(now)}  ·  up ${esc(formatUptime(m.uptime))}${tempStr}`;

  const SEP = "──────────────────────";

  // ── Header ───────────────────────────────────────────────────────
  const lines: string[] = [
    `🖥 <b>${title}</b>  —  ${healthTag(m)}`,
    subtitle,
    `🐧 ${esc(m.platform)} ${esc(m.arch)}  ·  ${esc(m.cpu.model)} (${m.cpu.cores}c)`,
    SEP,
  ];

  // ── CPU ──────────────────────────────────────────────────────────
  lines.push(`💻 CPU   <b>${m.cpu.usagePercent.toFixed(1)}%</b>  ${bar(m.cpu.usagePercent)}`);

  // ── RAM ──────────────────────────────────────────────────────────
  lines.push(
    `🧠 RAM  <b>${m.memory.usagePercent.toFixed(1)}%</b>  ${bar(m.memory.usagePercent)}  ${esc(formatBytes(m.memory.used))} / ${esc(formatBytes(m.memory.total))}`
  );
  if (m.memory.swapTotal > 0) {
    lines.push(
      `   Swap: ${esc(formatBytes(m.memory.swapUsed))} / ${esc(formatBytes(m.memory.swapTotal))}  (${m.memory.swapUsagePercent.toFixed(1)}%)`
    );
  }

  lines.push(SEP);

  // ── Disks ────────────────────────────────────────────────────────
  for (const d of m.disks) {
    lines.push(
      `💾 ${esc(d.mount)}   <b>${d.usagePercent}%</b>  ${bar(d.usagePercent)}  ${esc(formatBytes(d.available))} free`
    );
  }

  lines.push(SEP);

  // ── Network ──────────────────────────────────────────────────────
  lines.push(
    `🌐 ↓ <b>${esc(formatRate(m.network.rxRate))}</b>   ↑ <b>${esc(formatRate(m.network.txRate))}</b>`
  );

  // ── Top Processes ────────────────────────────────────────────────
  if (m.topProcs.length > 0) {
    lines.push(SEP);
    lines.push(`📊 <b>Top Processes</b>`);
    for (const p of m.topProcs) {
      const memBytes = Math.round((p.memPercent / 100) * m.memory.total);
      lines.push(
        `   <b>${esc(p.name.slice(0, 20))}</b>  ${p.cpuPercent.toFixed(1)}% CPU  ·  ${esc(formatBytes(memBytes))}`
      );
    }
  }

  // ── Alerts ───────────────────────────────────────────────────────
  const alerts: string[] = [];
  if (m.cpu.usagePercent > T.cpu.critical)
    alerts.push(`🔴 CPU tinggi: <b>${m.cpu.usagePercent.toFixed(1)}%</b>`);
  if (m.memory.usagePercent > T.ram.critical)
    alerts.push(`🔴 RAM hampir penuh: <b>${m.memory.usagePercent.toFixed(1)}%</b>`);
  if (m.memory.swapUsagePercent > T.swap.warn)
    alerts.push(`🟡 Swap tinggi: <b>${m.memory.swapUsagePercent.toFixed(1)}%</b>`);
  for (const d of m.disks) {
    if (d.usagePercent > T.disk.critical)
      alerts.push(`🔴 Disk <b>${esc(d.mount)}</b>: <b>${d.usagePercent}%</b>`);
  }

  if (alerts.length > 0) {
    lines.push(SEP);
    lines.push(`⚠️ <b>Alerts</b>`);
    lines.push(...alerts);
  }

  lines.push(SEP);
  lines.push(alerts.length === 0 ? "✨ All systems normal" : "");

  return lines.filter(Boolean).join("\n");
}

/* ------------------------------------------------------------------ */
/*  Telegram sender                                                    */
/* ------------------------------------------------------------------ */

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

  const m = await collectMetrics();
  const report = formatReportHTML(m, serverName);

  // Telegram 4096 char limit — split on double newlines if needed
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
