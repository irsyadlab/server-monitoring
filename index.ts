import { sendReport } from "./src/reporter";
import { saveConfig, loadConfig } from "./src/config";

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

// --- Daemon ---
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

// Direct run support (for dev / bun index.ts)
// When imported by cli.ts, cli.ts calls start() explicitly
const isDirectlyRun = import.meta.url.endsWith(process.argv[1]?.replace(/^.*\//, "") ?? "");
if (isDirectlyRun || process.argv[1]?.endsWith("index.ts")) {
  start();
}
