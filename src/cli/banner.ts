/* ------------------------------------------------------------------ */
/*  ANSI-coloured ASCII banner                                         */
/* ------------------------------------------------------------------ */

const c = {
  cyan: "\x1b[36m",
  gray: "\x1b[90m",
  gold: "\x1b[33m",
  reset: "\x1b[0m",
};

export function printBanner(): void {
  console.log("");
  console.log(
    `${c.cyan}  ███████  ███████ ██████  ██    ██ ███████ ██████  ███    ███  ██████  ███    ██${c.reset}`
  );
  console.log(
    `${c.cyan}  ██      ██      ██   ██ ██    ██ ██      ██   ██ ████  ████ ██    ██ ████   ██${c.reset}`
  );
  console.log(
    `${c.cyan}  ███████ █████   ██████  ██    ██ █████   ██████  ██ ████ ██ ██    ██ ██ ██  ██${c.reset}`
  );
  console.log(
    `${c.cyan}       ██ ██      ██   ██  ██  ██  ██      ██   ██ ██  ██  ██ ██    ██ ██  ██ ██${c.reset}`
  );
  console.log(
    `${c.cyan}  ███████ ███████ ██   ██   ████   ███████ ██   ██ ██      ██  ██████  ██   ████${c.reset}`
  );
  console.log("");
  console.log(
    `${c.gray}  ─────────────────────────────────────────────────────────────────────${c.reset}`
  );
  console.log(`  🖥  Server Monitor Daemon  •  Telegram  •  Bun  •  TypeScript`);
  console.log(
    `${c.gray}  ─────────────────────────────────────────────────────────────────────${c.reset}`
  );
  console.log(`${c.gold}                              by irsyadulibad${c.reset}`);
  console.log("");
}

export function printHelp(): void {
  printBanner();
  console.log("Usage:  servermon <command> [--name <server>]");
  console.log();
  console.log("Commands:");
  console.log("  setup [--name <srv>]  First-time setup (bot token + interval) for a server");
  console.log("  start [--name <srv>]  Start the monitoring daemon for a server");
  console.log("  report [--name <srv>] Send a one-time report without starting the daemon");
  console.log("  list                  List all configured servers");
  console.log("  delete --name <srv>   Delete a configured server");
  console.log(
    "  service <sub>         Manage systemd service (install, status, stop, restart, logs, uninstall)"
  );
  console.log();
  console.log("Examples:");
  console.log("  servermon setup");
  console.log("  servermon setup --name prod");
  console.log("  servermon start --name staging");
  console.log("  servermon report --name prod");
  console.log("  servermon list");
  console.log("  servermon delete --name prod");
  console.log("  servermon service install");
  console.log("  servermon service status");
  console.log("  servermon service logs");
}
