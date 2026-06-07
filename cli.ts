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

// ─────────────────────────────────────
//  systemd auto‑setup
// ─────────────────────────────────────
async function setupSystemd(): Promise<void> {
  banner();
  console.log("⚙️  Systemd Service Setup\n");

  const config = await loadConfig();
  if (!config) {
    console.error("❌ No config found. Run `servermon` first to set up.");
    console.error("   Then try: servermon --install-service");
    process.exit(1);
  }

  // Resolve paths
  const bunPath = Bun.which("bun");
  if (!bunPath) {
    console.error("❌ bun not found in PATH");
    process.exit(1);
  }

  const servermonPath = Bun.which("servermon");
  if (!servermonPath) {
    console.error("❌ servermon binary not found.");
    console.error("   Install with: bun i -g @irsyadulibad/servermon");
    process.exit(1);
  }

  console.log(`🔍 bun:       ${bunPath}`);
  console.log(`🔍 servermon: ${servermonPath}`);
  console.log(`📁 Config:    ${configPath()}`);
  console.log();

  // Create systemd user directory
  const home = process.env.HOME ?? "~";
  const systemdDir = `${home}/.config/systemd/user`;
  await Bun.write(`${systemdDir}/.gitkeep`, ""); // ensure dir exists
  try { await (Bun as any).mkdir?.(systemdDir, { recursive: true }); } catch { /* Bun.mkdir may not exist; fs fallback */ }
  try { await import("node:fs").then(m => m.mkdirSync(systemdDir, { recursive: true })); } catch {}

  const serviceFile = `${systemdDir}/servermon.service`;
  const serviceContent = `[Unit]
Description=Server Monitor — Telegram system health reports
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
ExecStart=${servermonPath} start
Restart=always
RestartSec=30
Environment=NODE_ENV=production

[Install]
WantedBy=default.target
`;

  await Bun.write(serviceFile, serviceContent);
  console.log(`📄 Written: ${serviceFile}`);
  console.log();

  // systemctl commands
  const cmds = [
    ["systemctl", "--user", "daemon-reload"],
    ["systemctl", "--user", "enable", "servermon.service"],
    ["systemctl", "--user", "start", "servermon.service"],
    ["systemctl", "--user", "status", "servermon.service", "--no-pager", "-l"],
  ];

  for (const cmd of cmds) {
    console.log(`🏃 ${cmd.join(" ")}`);
    const proc = Bun.spawnSync({ cmd, stdout: "pipe", stderr: "pipe" });
    const out = new TextDecoder().decode(proc.stdout);
    const err = new TextDecoder().decode(proc.stderr);
    if (out) console.log(out);
    if (err && proc.exitCode !== 0) console.error(err);
  }

  console.log();
  console.log("✅ Systemd service installed!");
  console.log();
  console.log("📌 For auto-start at boot, enable lingering:");
  console.log(`   loginctl enable-linger`);
  console.log();
  console.log("📋 Useful commands:");
  console.log("   systemctl --user status servermon    # check status");
  console.log("   systemctl --user stop servermon      # stop daemon");
  console.log("   systemctl --user restart servermon   # restart");
  console.log("   journalctl --user -u servermon -f    # watch logs");
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
  const cmd = process.argv[2];

  // --- subcommand routing ---
  if (cmd === "setup") {
    banner();
    await interactiveSetup();
    return;
  }

  if (cmd === "start") {
    banner();
    const config = await loadConfig();
    if (!config) {
      console.error("❌ No config found. Run `servermon setup` first.");
      process.exit(1);
    }
    process.env["TELEGRAM_BOT_TOKEN"] = config.token;
    process.env["MONITOR_INTERVAL"] = String(config.interval);
    if (config.chatId) process.env["TELEGRAM_CHAT_ID"] = config.chatId;

    console.log(`📁 Config: ${configPath()}`);
    console.log(`📡 Bot:    ...${config.token.slice(-8)}`);
    if (config.chatId) console.log(`💬 Chat:   ${config.chatId}`);
    console.log();

    const { start } = await import("./index.ts");
    await start();
    return;
  }

  if (cmd === "install-service" || cmd === "--install-service" || cmd === "--setup-systemd") {
    await setupSystemd();
    return;
  }

  // --- no/invalid subcommand → help ---
  console.log("╔══════════════════════════════════════╗");
  console.log("║     🖥  SERVER MONITOR DAEMON  🖥     ║");
  console.log("║     Telegram  •  Bun  •  TypeScript  ║");
  console.log("╚══════════════════════════════════════╝");
  console.log();
  console.log("Usage:  servermon <command>");
  console.log();
  console.log("Commands:");
  console.log("  setup            First-time setup (bot token + interval)");
  console.log("  start            Start the monitoring daemon");
  console.log("  install-service  Install as systemd user service");
  console.log();
  console.log("Examples:");
  console.log("  servermon setup");
  console.log("  servermon start");
  console.log("  servermon install-service");
}

main().catch((err) => {
  console.error("❌ Fatal error:", err?.message ?? err);
  process.exit(1);
});
