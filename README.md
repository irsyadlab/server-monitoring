# 🖥 Server Monitor

> **Lightweight server watchdog** — collects real-time system metrics and sends structured reports to Telegram.
> Global CLI tool. Install once, run anywhere. Built with Bun + TypeScript.

<p align="center">
  <img src="https://img.shields.io/badge/runtime-Bun-000?style=flat&logo=bun" alt="bun">
  <img src="https://img.shields.io/badge/language-TypeScript-3178C6?style=flat&logo=typescript" alt="ts">
  <img src="https://img.shields.io/badge/target-Telegram-26A5E4?style=flat&logo=telegram" alt="telegram">
  <img src="https://img.shields.io/badge/license-MIT-green?style=flat" alt="license">
</p>

---

## ✨ Features

| Category              | What it tracks                                                 |
| --------------------- | -------------------------------------------------------------- |
| 💻 **CPU**            | Model, core count, usage %, load average (1/5/15 min)          |
| 🧠 **RAM**            | Used / total, usage %, swap usage                              |
| 💾 **Disk**           | Per-mount used / total, usage % — deduplicated                 |
| 🌐 **Network**        | RX / TX rate (bytes/sec, sampled over 1s)                      |
| 🌡 **Temperature**    | CPU package temp via thermal zones (`/sys/class/thermal`)      |
| 📊 **Top Processes**  | Top 5 by CPU % — PID, name, CPU %, MEM %                       |
| 🚨 **Alerts**         | Auto-flag when CPU > 85%, RAM > 90%, disk > 90%, or swap > 50% |
| 🌍 **Multi-server**   | Monitor multiple servers with one bot via `--name` flag        |
| ⏱ **One-shot report** | Send a report on demand without starting the daemon            |

Each report is color-coded with 🟢🟡🔴 health indicators and visual bar charts.

---

## 🚀 Quick Start

### Install globally

```bash
bun i -g @irsyadulibad/servermon
```

### First run — interactive setup

```bash
servermon setup
```

You'll be prompted for:

1. **Telegram Bot Token** — get one from [@BotFather](https://t.me/BotFather)
2. **Report interval** — how often to send reports (default: 300s = 5 min)

Config is saved to `~/.irsyadulibad/servermon/config.json`.

### Send a message to your bot

DM your bot **once** (any message). The daemon auto-detects your chat ID.

### Start monitoring

```bash
servermon start
```

That's it. The daemon auto-detects your chat ID, sends an initial report, then loops.

---

## 📖 Usage

```
Usage:  servermon <command> [options]

Commands:
  setup [--name <srv>]  First-time setup (bot token + interval) for a server
  start [--name <srv>]  Start the monitoring daemon for a server
  report [--name <srv>] Send a one-time report without starting the daemon
  list                  List all configured servers
  delete <name>         Delete a configured server
  service <sub>         Manage systemd service

Options:
  -n, --name     Server name
  -h, --help     Show help
  -v, --version  Show version number
```

### Examples

```bash
# Basic setup
servermon setup

# Setup with a server name (for multi-server)
servermon setup --name prod

# Start monitoring a specific server
servermon start --name staging

# Start monitoring ALL configured servers at once
servermon start

# Send a one-time report (daemon not required)
servermon report --name prod

# List all configured servers
servermon list

# Delete a server config (interactive confirm)
servermon delete prod

# Force delete without confirmation
servermon delete prod --yes
```

### 🌍 Multi-server mode

`servermon start` (without `--name`) automatically runs **all configured servers** in a single daemon process — each server gets its own config, but they share one process and interval.

```
┌─────────────────────────────┐
│  servermon start            │
│  (multi-server daemon)      │
│                             │
│  ├─ default    → Telegram   │
│  ├─ prod       → Telegram   │
│  └─ staging    → Telegram   │
└─────────────────────────────┘
```

Reports appear with the server name in the header:

> 🖥 **server01** [**prod**] — ✅ HEALTHY
> 🖥 **server02** [**staging**] — ⚠️ WARNING

---

## 📷 Example Report

```
✅ HEALTHY
📅 7 Jun 2026, 22:11   │  ⏱ 3d 21h
🐧 linux x86_64        │  Intel Xeon E5-2680 v4 @ 2.40GHz (2c)

💻 CPU   10.5%  🟢 ▰▱▱▱▱▱▱▱▱▱
   Load: 0.59 / 1.40 / 1.51

🧠 RAM   27.3%  🟢 ▰▰▰▱▱▱▱▱▱▱
   1.0 GiB / 3.8 GiB

💾 DISK
   /      26%  🟢 ▰▰▰▱▱▱▱▱▱▱
    └ 7957 GiB / 33092 GiB

🌐 NET
   ↓ 2.6 KB/s   ↑ 808 B/s

📊 TOP PROCESSES
   57318  ps              CPU 200.0%  MEM   0.1%
   57296  bun             CPU  13.6%  MEM   1.0%
   56149  hermes          CPU   8.7%  MEM   5.3%

✨ All systems normal
```

When thresholds are crossed, alerts appear inline:

```
🚨 CRITICAL
🔴 RAM hampir penuh: 91.2%
🔴 Disk /: 91%
```

---

## 🔧 Scripts

| Command          | Description                                    |
| ---------------- | ---------------------------------------------- |
| `bun start`      | Run the daemon in dev mode                     |
| `bun run build`  | Compile standalone binary → `./server-monitor` |
| `bun run lint`   | Run ESLint                                     |
| `bun run format` | Format with Prettier                           |
| `bun run check`  | Format check + lint (CI-ready)                 |

---

## 📁 Project Structure

```
server-monitoring/
├── cli.ts                    # CLI wrapper (delegates to src/cli)
├── index.ts                  # Module entry (re-exports daemon functions)
├── src/
│   ├── types/                # Shared type definitions
│   │   └── index.ts
│   ├── config/               # Config CRUD (load, save, delete, listServers)
│   │   └── index.ts
│   ├── monitor/              # Metrics collector + formatting utilities
│   │   └── index.ts
│   ├── reporter/             # HTML formatter & Telegram sender
│   │   └── index.ts
│   ├── daemon/               # start(), startAll(), autoDetectChatId()
│   │   └── index.ts
│   └── cli/                  # CLI command routing (CrustJS) + interactive setup + banner
│       ├── banner.ts
│       ├── index.ts
│       └── service.ts        # systemd service subcommands
├── eslint.config.js
├── .prettierrc
├── package.json
└── tsconfig.json
```

---

## ⚙️ Config

Stored at `~/.irsyadulibad/servermon/config.json`:

```json
{
  "token": "883280...",
  "interval": 300,
  "chatId": "1216431846"
}
```

For named servers, configs are stored separately:

```
~/.irsyadulibad/servermon/
├── config.json          # default server
├── config-prod.json     # servermon setup --name prod
└── config-staging.json  # servermon setup --name staging
```

| Field      | Description                                               |
| ---------- | --------------------------------------------------------- |
| `token`    | Telegram bot token (required)                             |
| `interval` | Seconds between reports (min: 30, default: 300)           |
| `chatId`   | Auto-detected on first run, persisted for subsequent runs |
| `name`     | Server name label (set via `--name`, shown in reports)    |

---

## 📦 Deploy as systemd service

```bash
# Install & start
servermon service install

# Check health
servermon service status

# View real-time logs
servermon service logs

# Stop / restart / uninstall
servermon service stop
servermon service restart
servermon service uninstall --yes
```

This creates a user-level systemd service at `~/.config/systemd/user/servermon.service` that runs `servermon start` (multi-server mode) and automatically restarts on failure.

### Manual (if you prefer):

```bash
sudo tee /etc/systemd/system/servermon.service << 'EOF'
[Unit]
Description=Server Monitor Daemon
After=network.target

[Service]
Type=simple
ExecStart=/home/irsyad/.bun/bin/servermon start
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable --now servermon
```

---

## 🛠 Built With

- [Bun](https://bun.sh) — fast all-in-one JavaScript runtime
- [TypeScript](https://www.typescriptlang.org/) — type safety
- [Telegram Bot API](https://core.telegram.org/bots/api) — message delivery
- [CrustJS](https://crustjs.com) — CLI framework (command routing, plugins, type-safe parsing)
- [ESLint](https://eslint.org/) + [Prettier](https://prettier.io/) — code quality

---

## 📝 License

MIT — do whatever you want.
