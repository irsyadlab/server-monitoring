import { loadConfig, configPath } from "../config";

const HOME = process.env.HOME ?? "~";
const SYSTEMD_DIR = `${HOME}/.config/systemd/user`;
const SERVICE_NAME = "servermon.service";
const SERVICE_PATH = `${SYSTEMD_DIR}/${SERVICE_NAME}`;

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function sysctl(...args: string[]): { ok: boolean; out: string; err: string } {
  const proc = Bun.spawnSync({
    cmd: ["systemctl", "--user", ...args],
    stdout: "pipe",
    stderr: "pipe",
  });
  return {
    ok: proc.exitCode === 0,
    out: new TextDecoder().decode(proc.stdout).trim(),
    err: new TextDecoder().decode(proc.stderr).trim(),
  };
}

async function ensureSystemdDir(): Promise<void> {
  await Bun.write(`${SYSTEMD_DIR}/.gitkeep`, "");
  try {
    await (
      Bun as unknown as { mkdir?: (p: string, o: { recursive: boolean }) => Promise<void> }
    ).mkdir?.(SYSTEMD_DIR, { recursive: true });
  } catch {
    /* Bun.mkdir fallback */
  }
  try {
    await import("node:fs").then((m) => m.mkdirSync(SYSTEMD_DIR, { recursive: true }));
  } catch {
    /* fs fallback */
  }
}

function isInstalled(): boolean {
  const { out } = sysctl("is-enabled", SERVICE_NAME);
  return out !== "disabled" && out !== "";
}

function getServiceStatus(): string {
  const { out } = sysctl("status", SERVICE_NAME, "--no-pager", "-l");
  return out;
}

/* ------------------------------------------------------------------ */
/*  Subcommands                                                        */
/* ------------------------------------------------------------------ */

async function cmdInstall(): Promise<void> {
  const config = await loadConfig();
  if (!config) {
    console.error("❌ No config found. Run `servermon setup` first.");
    process.exit(1);
  }

  const bunPath = Bun.which("bun");
  if (!bunPath) {
    console.error("❌ bun not found in PATH");
    process.exit(1);
  }

  const servermonPath = Bun.which("servermon");
  if (!servermonPath) {
    console.error("❌ servermon binary not found. Install with: bun i -g @irsyadulibad/servermon");
    process.exit(1);
  }

  console.log(`🔍 bun:       ${bunPath}`);
  console.log(`🔍 servermon: ${servermonPath}`);
  console.log(`📁 Config:    ${configPath()}\n`);

  await ensureSystemdDir();

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

  await Bun.write(SERVICE_PATH, serviceContent);
  console.log(`📄 Written: ${SERVICE_PATH}`);

  // Reload, enable, start
  const steps = [
    ["daemon-reload"],
    ["enable", SERVICE_NAME],
    ["start", SERVICE_NAME],
    ["status", SERVICE_NAME, "--no-pager", "-l"],
  ];

  for (const args of steps) {
    const cmd = `systemctl --user ${args.join(" ")}`;
    console.log(`\n🏃 ${cmd}`);
    const { out, err, ok } = sysctl(...args);
    if (out) console.log(out);
    if (err && !ok) console.error(err);
  }

  console.log("\n✅ Systemd service installed and running!\n");
  console.log("📌 Useful commands:");
  console.log("   servermon service status    # check health");
  console.log("   servermon service logs      # watch logs");
  console.log("   servermon service stop      # stop daemon");
  console.log("   servermon service restart   # restart daemon");
  console.log("   servermon service uninstall # remove service\n");
  console.log("📌 For auto-start at boot:");
  console.log("   loginctl enable-linger");
}

function cmdStatus(): void {
  if (!isInstalled()) {
    console.log("📭 Systemd service is not installed.");
    console.log("   Run `servermon service install` first.");
    return;
  }

  const status = getServiceStatus();
  console.log(status);

  // Quick health summary
  const { out: activeState } = sysctl("is-active", SERVICE_NAME);
  const { out: enabledState } = sysctl("is-enabled", SERVICE_NAME);

  const activeIcon = activeState === "active" ? "✅" : "❌";
  const enabledIcon = enabledState === "enabled" ? "✅" : "❌";

  console.log(`\n${activeIcon} Active:   ${activeState}`);
  console.log(`${enabledIcon} Enabled:  ${enabledState}`);
}

function cmdStop(): void {
  console.log("🛑 Stopping servermon service...");
  const { ok, out, err } = sysctl("stop", SERVICE_NAME);
  if (out) console.log(out);
  if (err) console.error(err);
  console.log(ok ? "✅ Service stopped." : "⚠️  Could not stop service.");
}

function cmdRestart(): void {
  console.log("🔄 Restarting servermon service...");
  const { ok, out, err } = sysctl("restart", SERVICE_NAME);
  if (out) console.log(out);
  if (err) console.error(err);
  console.log(ok ? "✅ Service restarted." : "⚠️  Could not restart service.");
}

function cmdLogs(): void {
  if (!isInstalled()) {
    console.log("📭 Service not installed.");
    return;
  }

  const args = ["--user", "-u", SERVICE_NAME, "-f", "-n", "50"];
  const proc = Bun.spawn(["journalctl", ...args], { stdio: ["inherit", "inherit", "inherit"] });
  proc.exited.then((code) => {
    if (code !== 0 && code !== null) process.exit(code);
  });
}

async function cmdUninstall(): Promise<void> {
  const confirmFlag = process.argv.includes("--yes") || process.argv.includes("-y");
  if (!confirmFlag) {
    console.log("⚠️  This will stop and remove the servermon service.");
    console.log("   To confirm, run: `servermon service uninstall --yes`");
    return;
  }

  console.log("🗑  Uninstalling servermon service...");

  const steps = [
    { args: ["stop", SERVICE_NAME], label: "Stopping" },
    { args: ["disable", SERVICE_NAME], label: "Disabling" },
  ];

  for (const { args, label } of steps) {
    const { ok, err } = sysctl(...args);
    if (err) console.error(`⚠️  ${label}: ${err}`);
    if (ok) console.log(`✅ ${label}`);
  }

  // Remove service file
  try {
    await import("fs/promises").then((m) => m.unlink(SERVICE_PATH));
    console.log("✅ Service file removed");
  } catch {
    console.log("⚠️  Service file not found or already removed");
  }

  // Reload
  sysctl("daemon-reload");
  console.log("✅ Daemon reloaded");
  console.log("\n✅ Service uninstalled.");
}

/* ------------------------------------------------------------------ */
/*  Router                                                             */
/* ------------------------------------------------------------------ */

export async function serviceRouter(): Promise<void> {
  const sub = process.argv[3]; // servermon service <subcommand>

  switch (sub) {
    case "install":
      await cmdInstall();
      break;
    case "status":
      cmdStatus();
      break;
    case "stop":
      cmdStop();
      break;
    case "restart":
      cmdRestart();
      break;
    case "logs":
      cmdLogs();
      break;
    case "uninstall":
      await cmdUninstall();
      break;
    default:
      console.log("Usage:  servermon service <subcommand>");
      console.log();
      console.log("Subcommands:");
      console.log("  install             Install systemd service & start");
      console.log("  status              Check service health");
      console.log("  stop                Stop the service");
      console.log("  restart             Restart the service");
      console.log("  logs                Follow real-time logs");
      console.log("  uninstall [--yes]   Stop, disable, & remove service");
      console.log();
      console.log("Examples:");
      console.log("  servermon service install");
      console.log("  servermon service status");
      console.log("  servermon service logs");
      console.log("  servermon service uninstall --yes");
  }
}
