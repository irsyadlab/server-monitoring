import {
  loadConfig,
  saveConfig,
  configPath,
  configFile,
  listServers,
  deleteConfig,
} from "../config";
import { printBanner, printHelp } from "./banner";

/* ------------------------------------------------------------------ */
/*  systemd auto‑setup                                                 */
/* ------------------------------------------------------------------ */

async function setupSystemd(): Promise<void> {
  printBanner();
  console.log("⚙️  Systemd Service Setup\n");

  const config = await loadConfig();
  if (!config) {
    console.error("❌ No config found. Run `servermon` first to set up.");
    console.error("   Then try: servermon --install-service");
    process.exit(1);
  }

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
  console.log(`📁 Config:    ${configPath()}\n`);

  const home = process.env.HOME ?? "~";
  const systemdDir = `${home}/.config/systemd/user`;
  await Bun.write(`${systemdDir}/.gitkeep`, "");
  try {
    await (
      Bun as unknown as { mkdir?: (path: string, opts: { recursive: boolean }) => Promise<void> }
    ).mkdir?.(systemdDir, { recursive: true });
  } catch {
    /* Bun.mkdir may not exist; fs fallback */
  }
  try {
    await import("node:fs").then((m) => m.mkdirSync(systemdDir, { recursive: true }));
  } catch {
    /* fs.mkdirSync fallback */
  }

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
  console.log(`📄 Written: ${serviceFile}\n`);

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

  console.log("\n✅ Systemd service installed!\n");
  console.log("📌 For auto-start at boot, enable lingering:");
  console.log(`   loginctl enable-linger\n`);
  console.log("📋 Useful commands:");
  console.log("   systemctl --user status servermon    # check status");
  console.log("   systemctl --user stop servermon      # stop daemon");
  console.log("   systemctl --user restart servermon   # restart");
  console.log("   journalctl --user -u servermon -f    # watch logs");
}

/* ------------------------------------------------------------------ */
/*  Interactive setup                                                  */
/* ------------------------------------------------------------------ */

async function interactiveSetup(name?: string): Promise<void> {
  const tag = name ? ` [${name}]` : "";
  console.log(`🖥  Server Monitor — First Time Setup${tag}`);
  console.log(`   Config will be saved to: ${configFile(name)}\n`);

  const token = prompt("🔑 Telegram Bot Token: ")?.trim();
  if (!token) {
    console.error("❌ Bot token is required. Get one from @BotFather on Telegram.");
    process.exit(1);
  }

  if (!token.includes(":")) {
    console.error("❌ Invalid bot token format. Should look like: 123456:ABC-DEF1234gh...");
    process.exit(1);
  }

  console.log("\n⏱  Choose report interval:");
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

  await saveConfig({ token, interval, name });
  console.log(`\n✅ Config saved!`);
  console.log(`   📁 ${configFile(name)}`);
  console.log(`   ⏱  Interval: ${interval}s (${label})`);
  const serverTag = name ? ` --name ${name}` : "";
  console.log(
    `\n📡 Next step: DM your bot once on Telegram, then run \`servermon start${serverTag}\`.`
  );
}

/* ------------------------------------------------------------------ */
/*  Utilities                                                          */
/* ------------------------------------------------------------------ */

export function parseFlag(argv: string[], flag: string): string | null {
  const idx = argv.indexOf(flag);
  if (idx === -1 || idx + 1 >= argv.length) return null;
  const val = argv[idx + 1]!;
  if (val.startsWith("--")) return null;
  return val;
}

/* ------------------------------------------------------------------ */
/*  Main entry point                                                   */
/* ------------------------------------------------------------------ */

export async function main(): Promise<void> {
  const cmd = process.argv[2];

  if (cmd === "setup") {
    printBanner();
    const name = parseFlag(process.argv, "--name") ?? undefined;
    await interactiveSetup(name);
    return;
  }

  if (cmd === "start") {
    const name = parseFlag(process.argv, "--name") ?? undefined;

    if (name) {
      printBanner();
      const config = await loadConfig(name);
      if (!config) {
        console.error(
          `❌ No config found for server "${name}". Run \`servermon setup --name ${name}\` first.`
        );
        process.exit(1);
      }
      process.env["TELEGRAM_BOT_TOKEN"] = config.token;
      process.env["MONITOR_INTERVAL"] = String(config.interval);
      if (config.chatId) process.env["TELEGRAM_CHAT_ID"] = config.chatId;
      if (config.name) process.env["SERVER_NAME"] = config.name;

      console.log(`📁 Config: ${configPath(config.name)}`);
      console.log(`📡 Bot:    ...${config.token.slice(-8)}`);
      if (config.chatId) console.log(`💬 Chat:   ${config.chatId}`);
      if (config.name) console.log(`🏷  Name:   ${config.name}`);
      console.log();

      const { start } = await import("../daemon");
      await start();
    } else {
      printBanner();
      console.log("  🌐 Multi-server mode — monitoring all configured servers\n");
      const { startAll } = await import("../daemon");
      await startAll();
    }
    return;
  }

  if (cmd === "report") {
    const name = parseFlag(process.argv, "--name") ?? undefined;
    const config = await loadConfig(name);
    if (!config) {
      console.error(
        name
          ? `❌ No config found for server "${name}". Run \`servermon setup --name ${name}\` first.`
          : "❌ No config found. Run `servermon setup` first."
      );
      process.exit(1);
    }
    if (!config.chatId) {
      console.error("❌ Chat ID not set. Run `servermon start` first to auto-detect.");
      process.exit(1);
    }

    console.log(`📤 Sending one-time report${name ? ` for [${name}]` : ""}...`);
    console.log(`📡 Bot: ...${config.token.slice(-8)}  💬 ${config.chatId}\n`);

    const { sendReport } = await import("../reporter");
    const ok = await sendReport(config.token, config.chatId, config.name);
    console.log(ok ? "✅ Report sent!" : "❌ Failed to send report");
    return;
  }

  if (cmd === "delete") {
    const rawName = parseFlag(process.argv, "--name");
    if (!rawName) {
      console.error("❌ Specify which server to delete: `servermon delete --name <server>`");
      console.log("   Use `servermon list` to see available servers.");
      process.exit(1);
    }

    const name = rawName === "default" ? undefined : rawName;
    const cfg = await loadConfig(name);
    if (!cfg) {
      console.error(`❌ No server found with name "${rawName}".`);
      process.exit(1);
    }

    console.log(`⚠️  You are about to delete server config: "${rawName}"`);
    console.log(`   📁 ${configFile(name)}`);
    console.log(`   🤖 Bot: ...${cfg.token.slice(-8)}`);
    if (cfg.chatId) console.log(`   💬 Chat: ${cfg.chatId}`);
    console.log("\n   This action cannot be undone.\n");

    const confirmFlag = parseFlag(process.argv, "--yes") || parseFlag(process.argv, "-y");
    if (!confirmFlag) {
      console.error("   To confirm, run: `servermon delete --name <server> --yes`");
      process.exit(1);
    }

    const ok = await deleteConfig(name);
    if (ok) {
      console.log(`✅ Server "${rawName}" deleted.`);
    } else {
      console.error(`❌ Failed to delete server "${rawName}".`);
      process.exit(1);
    }
    return;
  }

  if (cmd === "list") {
    const servers = await listServers();
    if (servers.length === 0) {
      console.log("📭 No configured servers.");
      console.log("   Run `servermon setup` or `servermon setup --name <name>` first.");
      return;
    }
    console.log("📋 Configured Servers:");
    for (const s of servers) {
      const cfg = await loadConfig(s === "default" ? undefined : s);
      const nameTag = cfg?.name ? ` (--name ${cfg.name})` : "";
      const interval = cfg?.interval ?? "?";
      const chatLabel = cfg?.chatId ? `  💬 ${cfg.chatId}` : "  ❌ not yet paired";
      console.log(`   • ${s}${nameTag}`);
      console.log(`     ⏱ ${interval}s  ${chatLabel}`);
    }
    return;
  }

  if (cmd === "install-service" || cmd === "--install-service" || cmd === "--setup-systemd") {
    await setupSystemd();
    return;
  }

  // --- no/invalid subcommand → help ---
  printHelp();
}
