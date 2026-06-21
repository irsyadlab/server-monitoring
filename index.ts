import { sendReport } from "./src/reporter";
import { saveConfig, loadConfig, listServers, type ServerMonConfig } from "./src/config";

const botToken = process.env["TELEGRAM_BOT_TOKEN"] ?? "";
let chatId = process.env["TELEGRAM_CHAT_ID"] ?? "";
const rawInterval = process.env["MONITOR_INTERVAL"] ?? "300";
const intervalSec = Math.max(30, parseInt(rawInterval) || 300);
const serverName = process.env["SERVER_NAME"] ?? "";

// --- Auto-detect chat ID ---
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

// --- Single-server daemon ---
export async function start() {
  if (!botToken) {
    console.error("❌ TELEGRAM_BOT_TOKEN not set. Run `servermon` first to configure.");
    process.exit(1);
  }

  if (!chatId) {
    console.log("🔍 TELEGRAM_CHAT_ID not set — auto-detecting...");
    let detected = await autoDetectChatId(botToken);

    if (!detected) {
      console.log("⏳ Waiting for you to DM the bot on Telegram...");
      console.log("   (polling every 10s — no restart needed)");
      console.log();

      const POLL_INTERVAL_MS = 10_000;

      while (!detected) {
        await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
        detected = await autoDetectChatId(botToken);
      }
    }

    chatId = detected;
    // Persist to config
    try {
      const { loadConfig } = await import("./src/config");
      const cfg = await loadConfig();
      if (cfg) {
        cfg.chatId = chatId;
        await saveConfig(cfg);
        console.log("💾 Chat ID saved to config");
      }
    } catch {
      // ok
    }
  }

  console.log(`⏱  Interval: ${intervalSec}s (${(intervalSec / 60).toFixed(0)} menit)`);
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

  // Run once at startup
  await tick();

  // Loop
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

// --- Multi-server daemon (runs ALL configured servers) ---
export async function startAll() {
  const servers = await listServers();
  if (servers.length === 0) {
    console.error("❌ No configured servers found. Run `servermon setup` first.");
    process.exit(1);
  }

  console.log(`📋 Found ${servers.length} server(s) to monitor:`);
  console.log();

  const configs: Array<{ name: string; cfg: ServerMonConfig }> = [];
  for (const s of servers) {
    const cfg = await loadConfig(s === "default" ? undefined : s);
    if (!cfg) {
      console.log(`   ⚠️  ${s}: config unreadable, skipping`);
      continue;
    }
    if (!cfg.chatId) {
      // Auto-detect for first server, apply to all
      if (configs.length === 0) {
        console.log(`🔍 ${s}: Chat ID not set — auto-detecting...`);
        const detected = await autoDetectChatId(cfg.token);
        if (detected) {
          cfg.chatId = detected;
          await saveConfig({ ...cfg, chatId: detected });
          console.log(`💾 ${s}: Chat ID ${detected} saved`);
        } else {
          console.log(`   ❌ ${s}: no chat ID yet. DM your bot first then restart.`);
          continue;
        }
      } else {
        // Use the same chat ID from the first server (they share the same bot)
        console.log(`   ❌ ${s}: no chat ID. Run 'servermon start --name ${s}' first.`);
        continue;
      }
    }
    configs.push({ name: s, cfg });
  }

  if (configs.length === 0) {
    console.error("❌ No servers ready to monitor.");
    process.exit(1);
  }

  console.log();
  console.log(`🔄 Monitoring ${configs.length} server(s) — reports every ${intervalSec}s`);
  console.log();

  async function tickAll() {
    const ts = new Date().toLocaleString("id-ID", { timeZone: "Asia/Jakarta" });
    for (const { name, cfg } of configs) {
      if (!cfg.chatId) continue;
      const start2 = Date.now();
      const ok = await sendReport(cfg.token, cfg.chatId, name === "default" ? undefined : name);
      const elapsed = Date.now() - start2;
      console.log(`[${ts}] ${ok ? "✅" : "❌"} ${name} — ${elapsed}ms`);
    }
  }

  // First tick
  await tickAll();

  // Loop
  setInterval(tickAll, intervalSec * 1000);

  process.on("SIGINT", () => {
    console.log("\n👋 Shutting down...");
    process.exit(0);
  });
  process.on("SIGTERM", () => {
    console.log("\n👋 Shutting down...");
    process.exit(0);
  });
}

// Direct run support (for dev / bun index.ts)
// When imported by cli.ts, cli.ts calls start() explicitly
const isDirectlyRun = import.meta.url.endsWith(process.argv[1]?.replace(/^.*\//, "") ?? "");
if (isDirectlyRun || process.argv[1]?.endsWith("index.ts")) {
  start();
}
