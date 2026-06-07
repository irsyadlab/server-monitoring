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

  console.log();
  console.log("⏱  Choose report interval:");
  console.log("   1. Every 5 minutes");
  console.log("   2. Every 1 hour");
  console.log("   3. Every 3 hours");
  console.log("   4. Every 6 hours");
  console.log("   5. Every 12 hours");
  console.log("   6. Custom (in seconds)");

  const choice = prompt("   Pick [1-6] (default: 1): ")?.trim() || "1";

  const intervals: Record<string, number> = {
    "1": 300,
    "2": 3600,
    "3": 10800,
    "4": 21600,
    "5": 43200,
  };

  let interval: number;
  if (choice === "6") {
    const custom = prompt("   Enter interval in seconds: ")?.trim();
    interval = Math.max(30, parseInt(custom || "300") || 300);
  } else {
    interval = intervals[choice] ?? 300;
  }

  const label =
    interval >= 3600
      ? `${(interval / 3600).toFixed(0)} hour(s)`
      : `${(interval / 60).toFixed(0)} min`;

  await saveConfig({ token, interval });
  console.log(`\n✅ Config saved!`);
  console.log(`   📁 ${configPath()}`);
  console.log(`   ⏱  Interval: ${interval}s (${label})`);
  console.log(`\n📡 Next step: DM your bot once on Telegram, then run \`servermon\`.`);
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
