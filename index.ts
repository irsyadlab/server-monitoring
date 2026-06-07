import { sendReport } from "./src/reporter";

// --- Config from env ---
const botToken = process.env["TELEGRAM_BOT_TOKEN"] ?? "";
let chatId = process.env["TELEGRAM_CHAT_ID"] ?? ""; // optional — auto-detect kalau kosong
const rawInterval = process.env["MONITOR_INTERVAL"] ?? "300";
const intervalSec = Math.max(30, parseInt(rawInterval) || 300);

function banner() {
  console.log("╔══════════════════════════════════════╗");
  console.log("║     🖥  SERVER MONITOR DAEMON  🖥     ║");
  console.log("║     Telegram  •  Bun  •  TypeScript  ║");
  console.log("╚══════════════════════════════════════╝");
  console.log();
}

if (!botToken) {
  banner();
  console.error("❌ TELEGRAM_BOT_TOKEN must be set in .env");
  process.exit(1);
}

// --- Auto-detect chat ID ---
async function autoDetectChatId(token: string): Promise<string | null> {
  try {
    const resp = await fetch(`https://api.telegram.org/bot${token}/getUpdates?limit=5`);
    const data = await resp.json();
    if (!data.ok || !data.result?.length) return null;

    // Collect unique chat IDs from recent updates, prefer newest
    const chatIds = new Set<string>();
    for (const update of data.result.reverse()) {
      const chat = update.message?.chat || update.channel_post?.chat;
      if (chat?.id) chatIds.add(String(chat.id));
    }
    if (chatIds.size === 0) return null;

    // Pick first (most recent) chat ID
    const id = [...chatIds][0]!;
    const chatInfo = data.result.find(
      (u: {
        message?: { chat?: { id: number; title?: string; first_name?: string } };
        channel_post?: { chat?: { id: number; title?: string } };
      }) => String(u.message?.chat?.id || u.channel_post?.chat?.id) === id
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

// --- Main ---
banner();
console.log(`⏱  Interval: ${intervalSec}s (${(intervalSec / 60).toFixed(0)} menit)`);
console.log(`📡 Bot:      ...${botToken.slice(-8)}`);

if (!chatId) {
  console.log("🔍 TELEGRAM_CHAT_ID not set — auto-detecting...");
  const detected = await autoDetectChatId(botToken);
  if (!detected) {
    console.error("❌ No recent chats found. DM your bot first, then re-run.");
    console.error("   Or set TELEGRAM_CHAT_ID in .env manually.");
    process.exit(1);
  }
  chatId = detected;
  // Persist to .env biar nggak perlu detect lagi
  try {
    const envPath = new URL(".env", import.meta.url).pathname;
    let env = await Bun.file(envPath).text();
    if (!env.includes("TELEGRAM_CHAT_ID=")) {
      env += `\nTELEGRAM_CHAT_ID=${chatId}\n`;
      await Bun.write(envPath, env);
      console.log("💾 Chat ID saved to .env");
    }
  } catch {
    // ok if can't persist
  }
}

console.log(`💬 Chat:     ${chatId}`);
console.log();

async function tick() {
  const start = Date.now();
  const ok = await sendReport(botToken, chatId);
  const elapsed = Date.now() - start;
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
