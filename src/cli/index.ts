import { Crust } from "@crustjs/core";
import { helpPlugin, versionPlugin, didYouMeanPlugin } from "@crustjs/plugins";
import {
  loadConfig,
  saveConfig,
  configPath,
  listServers,
  deleteConfig,
} from "../config";
import { printBanner } from "./banner";
import { serviceCmd } from "./service";
import pkg from "../../package.json";

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

async function interactiveSetup(name?: string): Promise<void> {
  const tag = name ? ` [${name}]` : "";
  console.log(`🖥  Server Monitor — First Time Setup${tag}`);
  console.log(`   Config will be saved to: ${configPath()}\n`);

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
  console.log(`   📁 ${configPath()}`);
  console.log(`   ⏱  Interval: ${interval}s (${label})`);
  const serverTag = name ? ` --name ${name}` : "";
  console.log(
    `\n📡 Next step: DM your bot once on Telegram, then run \`servermon start${serverTag}\`.`
  );
}

/* ------------------------------------------------------------------ */
/*  App definition                                                     */
/* ------------------------------------------------------------------ */

export function createApp(): Crust {
  const app = new Crust("servermon")
    .use(helpPlugin())
    .use(versionPlugin(pkg.version))
    .use(didYouMeanPlugin())
    .meta({
      description:
        "Lightweight server monitoring daemon — collect system metrics and send structured reports to Telegram",
    })
    .flags({
      name: {
        type: "string",
        description: "Server name",
        short: "n",
        inherit: true,
      },
    })
    /* ---- setup ---- */
    .command("setup", (cmd) =>
      cmd
        .meta({ description: "First-time setup (bot token + interval)" })
        .run(async ({ flags }) => {
          await interactiveSetup(flags.name);
        })
    )
    /* ---- start ---- */
    .command("start", (cmd) =>
      cmd
        .meta({ description: "Start the monitoring daemon" })
        .run(async ({ flags }) => {
          const name = flags.name;

          if (name) {
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
            if (name) process.env["SERVER_NAME"] = name;

            console.log(`📁 Config: ${configPath()}`);
            console.log(`📡 Bot:    ...${config.token.slice(-8)}`);
            if (config.chatId) console.log(`💬 Chat:   ${config.chatId}`);
            if (name) console.log(`🏷  Name:   ${name}`);
            console.log();

            const { start } = await import("../daemon");
            await start();
          } else {
            console.log("  🌐 Multi-server mode — monitoring all configured servers\n");
            const { startAll } = await import("../daemon");
            await startAll();
          }
        })
    )

    /* ---- report ---- */
    .command("report", (cmd) =>
      cmd
        .meta({ description: "Send a one-time report without starting the daemon" })
        .run(async ({ flags }) => {
          const name = flags.name;
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
          const ok = await sendReport(config.token, config.chatId, name ?? undefined);
          console.log(ok ? "✅ Report sent!" : "❌ Failed to send report");
        })
    )

    /* ---- list ---- */
    .command("list", (cmd) =>
      cmd.meta({ description: "List all configured servers" }).run(async () => {
        const servers = await listServers();
        if (servers.length === 0) {
          console.log("📭 No configured servers.");
          console.log("   Run `servermon setup` or `servermon setup --name <name>` first.");
          return;
        }
        console.log("📋 Configured Servers:");
        for (const s of servers) {
          const cfg = await loadConfig(s === "default" ? undefined : s);
          const interval = cfg?.interval ?? "?";
          const chatLabel = cfg?.chatId ? `  💬 ${cfg.chatId}` : "  ❌ not yet paired";
          console.log(`   • ${s}`);
          console.log(`     ⏱ ${interval}s  ${chatLabel}`);
        }
      })
    )

    /* ---- delete ---- */
    .command("delete", (cmd) =>
      cmd
        .meta({ description: "Delete a configured server" })
        .args([{ name: "name", type: "string", description: "Server name" }] as const)
        .flags({
          yes: {
            type: "boolean",
            description: "Skip confirmation",
            short: "y",
          },
        })
        .run(async ({ args, flags }) => {
          const rawName = args.name ?? flags.name;
          if (!rawName) {
            console.error("❌ Usage: servermon delete <name>");
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
          console.log(`   📁 ${configPath()}`);
          console.log(`   🤖 Bot: ...${cfg.token.slice(-8)}`);
          if (cfg.chatId) console.log(`   💬 Chat: ${cfg.chatId}`);
          console.log("\n   This action cannot be undone.\n");

          if (!flags.yes) {
            const answer = prompt("   Type 'yes' to confirm: ")?.trim().toLowerCase();
            if (answer !== "yes") {
              console.log("❌ Cancelled.");
              return;
            }
          }

          const ok = await deleteConfig(name);
          if (ok) {
            console.log(`✅ Server "${rawName}" deleted.`);
          } else {
            console.error(`❌ Failed to delete server "${rawName}".`);
            process.exit(1);
          }
        })
    )

    /* ---- dashboard ---- */
    .command("dashboard", (cmd) =>
      cmd
        .meta({ description: "Start embedded web dashboard (HTMX + Elysia)" })
        .flags({
          port: {
            type: "number",
            description: "HTTP port (default: 3456)",
            short: "p",
            default: 3456,
          },
        })
        .run(async ({ flags }) => {
          const { startDashboard } = await import("./dashboard");
          await startDashboard(flags.port ?? 3456);
        })
    )

    /* ---- service ---- */
    .command("service", (cmd) => serviceCmd(cmd))

    /* ---- deprecated aliases (hidden) ---- */
    .command("install-service", (cmd) =>
      cmd.meta({ hidden: true }).run(async () => {
        console.log("ℹ️  This command is deprecated. Use: `servermon service install`");
        const { serviceRouter } = await import("./service");
        await serviceRouter(["install"]);
      })
    )
    .command("--install-service", (cmd) =>
      cmd.meta({ hidden: true }).run(async () => {
        console.log("ℹ️  This command is deprecated. Use: `servermon service install`");
        const { serviceRouter } = await import("./service");
        await serviceRouter(["install"]);
      })
    )
    .command("--setup-systemd", (cmd) =>
      cmd.meta({ hidden: true }).run(async () => {
        console.log("ℹ️  This command is deprecated. Use: `servermon service install`");
        const { serviceRouter } = await import("./service");
        await serviceRouter(["install"]);
      })
    );

  return app;
}

/* ------------------------------------------------------------------ */
/*  Main entry point                                                   */
/* ------------------------------------------------------------------ */

export async function main(): Promise<void> {
  printBanner();
  const app = createApp();
  // No args → show help
  if (process.argv.length <= 2) {
    await app.execute({ argv: ["--help"] });
  } else {
    await app.execute();
  }
}
