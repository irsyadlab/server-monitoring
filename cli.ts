#!/usr/bin/env bun
/**
 * Server Monitor — Global CLI entry point.
 * Handles first-time interactive setup and starts the monitoring daemon.
 */

import { loadConfig, saveConfig, configPath, configDir } from "./src/config";

function banner() {
  console.log("╔══════════════════════════════════════╗");
  console.log("║     🖥  SERVER MONITOR DAEMON  🖥     ║");
  console.log("║     Telegram  •  Bun  •  TypeScript  ║");
  console.log("╚══════════════════════════════════════╝");
  console.log();
}

async function interactiveSetup(): Promise<void> {
  console.log("🖥  Server Monitor — First Time Setup");
  console.log(`   Config will be saved to: ${configDir()}\n`);

  const token = prompt("🔑 Telegram Bot Token: ")?.trim();
  if (!token) {
    console.error("❌ Bot token is required. Get one from @BotFather on Telegram.");
    process.exit(1);
  }

  if (!token.includes(":")) {
    console.error("❌ Invalid bot token format. Should look like: 123456:ABC-DEF1234gh...");
    process.exit(1);
  }

  const intervalRaw =
    prompt("⏱  Report interval in seconds (default 300 = 5 min): ")?.trim() || "300";
  const interval = Math.max(30, parseInt(intervalRaw) || 300);

  await saveConfig({ token, interval });
  console.log(`\n✅ Config saved!`);
  console.log(`   📁 ${configPath()}`);
  console.log(`   ⏱  Interval: ${interval}s (${(interval / 60).toFixed(0)} min)`);
  console.log(`\n📡 Next step: DM your bot once on Telegram, then re-run \`servermon\`.`);
}

async function main() {
  banner();

  const config = await loadConfig();

  if (!config) {
    await interactiveSetup();
    process.exit(0);
  }

  // Push config into env for the daemon
  process.env["TELEGRAM_BOT_TOKEN"] = config.token;
  process.env["MONITOR_INTERVAL"] = String(config.interval);
  if (config.chatId) process.env["TELEGRAM_CHAT_ID"] = config.chatId;

  console.log(`📁 Config: ${configPath()}`);
  console.log(`📡 Bot:    ...${config.token.slice(-8)}`);
  if (config.chatId) console.log(`💬 Chat:   ${config.chatId}`);
  console.log();

  // Start the daemon
  const { start } = await import("./index.ts");
  await start();
}

main().catch((err) => {
  console.error("❌ Fatal error:", err?.message ?? err);
  process.exit(1);
});
