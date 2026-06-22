import { sendReport } from "../reporter";
import { saveConfig, loadConfig, listServers } from "../config";
import type { NamedConfig } from "../types";

/* ------------------------------------------------------------------ */
/*  Environment variables (set by cli/)                                */
/* ------------------------------------------------------------------ */

const botToken = process.env["TELEGRAM_BOT_TOKEN"] ?? "";
let chatId = process.env["TELEGRAM_CHAT_ID"] ?? "";
const rawInterval = process.env["MONITOR_INTERVAL"] ?? "300";
const intervalSec = Math.max(30, parseInt(rawInterval) || 300);
const serverName = process.env["SERVER_NAME"] ?? "";

/* ------------------------------------------------------------------ */
/*  Auto-detect Telegram chat ID                                       */
/* ------------------------------------------------------------------ */

async function autoDetectChatId(token: string): Promise<string | null> {
  try {
    const resp = await fetch(`https://api.telegram.org/bot${token}/getUpdates?limit=5`);
    const data = (await resp.json()) as {
      ok: boolean;
      result?: Array<{
        message?: { chat?: { id: number; title?: string; first_name?: string } };
        channel_post?: { chat?: { id: number; title?: string } };
      }>;
    };
    if (!data.ok || !data.result?.length) return null;

    const chatIds = new Set<string>();
    for (const update of data.result.reverse()) {
      const chat = update.message?.chat || update.channel_post?.chat;
      if (chat?.id) chatIds.add(String(chat.id));
    }
    if (chatIds.size === 0) return null;

    const id = [...chatIds][0]!;
    const chatInfo = data.result.find(
      (u) => String(u.message?.chat?.id || u.channel_post?.chat?.id) === id
    );
    const chatName =
      chatInfo?.message?.chat?.title ||
      chatInfo?.message?.chat?.first_name ||
      chatInfo?.channel_post?.chat?.title ||
      "Unknown";
    console.log(`🔍 Auto-detected chat: ${chatName} (ID: ${id})`);
    return id;
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------ */
/*  Persist chat ID to config file                                     */
/* ------------------------------------------------------------------ */

async function persistChatId(id: string, name?: string): Promise<void> {
  try {
    const entry = await loadConfig(name);
    if (entry) {
      entry.chatId = id;
      await saveConfig({ ...entry, name });
      console.log("💾 Chat ID saved to config");
    }
  } catch {
    // ok
  }
}

/* ------------------------------------------------------------------ */
/*  Single-server daemon                                               */
/* ------------------------------------------------------------------ */

export async function start(): Promise<void> {
  if (!botToken) {
    console.error("❌ TELEGRAM_BOT_TOKEN not set. Run `servermon` first to configure.");
    process.exit(1);
  }

  if (!chatId) {
    console.log("🔍 TELEGRAM_CHAT_ID not set — auto-detecting...");
    let detected = await autoDetectChatId(botToken);

    if (!detected) {
      console.log("⏳ Waiting for you to DM the bot on Telegram...");
      console.log("   (polling every 10s — no restart needed)\n");

      const POLL_INTERVAL_MS = 10_000;
      while (!detected) {
        await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
        detected = await autoDetectChatId(botToken);
      }
    }

    chatId = detected;
    await persistChatId(chatId, serverName || undefined);
  }

  console.log(`⏱  Interval: ${intervalSec}s (${(intervalSec / 60).toFixed(0)} min)`);
  console.log(`📡 Bot:      ...${botToken.slice(-8)}`);
  console.log(`💬 Chat:     ${chatId}`);
  if (serverName) console.log(`🏷  Server:   ${serverName}`);
  console.log();

  async function tick() {
    const start2 = Date.now();
    const ok = await sendReport(botToken, chatId, serverName || undefined);
    const elapsed = Date.now() - start2;
    const ts = new Date().toLocaleString("id-ID", { timeZone: "Asia/Jakarta" });
    console.log(`[${ts}] ${ok ? "✅" : "❌"} ${elapsed}ms`);
  }

  await tick();
  setInterval(tick, intervalSec * 1000);

  process.on("SIGINT", () => {
    console.log("\n👋 Shutting down...");
    process.exit(0);
  });
  process.on("SIGTERM", () => {
    console.log("\n👋 Shutting down...");
    process.exit(0);
  });
}

/* ------------------------------------------------------------------ */
/*  Multi-server daemon (runs all configured servers)                  */
/* ------------------------------------------------------------------ */

export async function startAll(): Promise<void> {
  const servers = await listServers();
  if (servers.length === 0) {
    console.error("❌ No configured servers found. Run `servermon setup` first.");
    process.exit(1);
  }

  console.log(`📋 Found ${servers.length} server(s) to monitor:\n`);

  const configs: NamedConfig[] = [];
  for (const name of servers) {
    const entry = await loadConfig(name);
    if (!entry) {
      console.log(`   ⚠️  ${name}: config unreadable, skipping`);
      continue;
    }
    if (!entry.chatId) {
      if (configs.length === 0) {
        console.log(`🔍 ${name}: Chat ID not set — auto-detecting...`);
        const detected = await autoDetectChatId(entry.token);
        if (detected) {
          entry.chatId = detected;
          await saveConfig({ ...entry, name });
          console.log(`💾 ${name}: Chat ID ${detected} saved`);
        } else {
          console.log(`   ❌ ${name}: no chat ID yet. DM your bot first then restart.`);
          continue;
        }
      } else {
        console.log(`   ❌ ${name}: no chat ID. Run 'servermon start --name ${name}' first.`);
        continue;
      }
    }
    configs.push({ name, cfg: entry });
  }

  if (configs.length === 0) {
    console.error("❌ No servers ready to monitor.");
    process.exit(1);
  }

  console.log();
  console.log(`🔄 Monitoring ${configs.length} server(s) — each with its own interval`);
  for (const { name, cfg } of configs) {
    const label =
      (cfg.interval ?? 300) >= 3600
        ? `${((cfg.interval ?? 300) / 3600).toFixed(0)} hr`
        : `${((cfg.interval ?? 300) / 60).toFixed(0)} min`;
    console.log(`   • ${name} → every ${label}`);
  }
  console.log();

  async function tickOne(cfg: NamedConfig["cfg"], name: string) {
    if (!cfg.chatId) return;
    const start2 = Date.now();
    const ok = await sendReport(cfg.token, cfg.chatId, name === "default" ? undefined : name);
    const elapsed = Date.now() - start2;
    const ts = new Date().toLocaleString("id-ID", { timeZone: "Asia/Jakarta" });
    console.log(`[${ts}] ${ok ? "✅" : "❌"} ${name} — ${elapsed}ms`);
  }

  // Fire immediate tick + schedule each server with its own interval
  for (const { name, cfg } of configs) {
    tickOne(cfg, name);
    setInterval(() => tickOne(cfg, name), (cfg.interval ?? 300) * 1000);
  }

  process.on("SIGINT", () => {
    console.log("\n👋 Shutting down...");
    process.exit(0);
  });
  process.on("SIGTERM", () => {
    console.log("\n👋 Shutting down...");
    process.exit(0);
  });
}
