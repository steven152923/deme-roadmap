# Deme Ops

Deme Ops is Deme's private, local-first Windows operations workspace.

It started as Deme Roadmap, but 0.6.1 changes the product direction: this is no longer primarily a Trello-style feature board. Deme Ops is the place for product delivery, QA, launch readiness, incoming operational signals, connected systems, local evidence and future Deme-wide intelligence such as moderation activity and app metrics.

The Windows desktop remains authoritative. Canonical work data stays local on the PC, the existing passcode system remains intact, and the LAN companion only works through explicit device pairing while Deme Ops is unlocked.

## 0.6.1 information architecture

The desktop intentionally has five top-level concepts:

- **Overview** — operational dashboard showing the active release, blockers, QA state, incoming signals, backend health, service checks and recent activity.
- **Work** — delivery, QA, schedule, ideas, notes, decisions, launch, planning, all work and archive as contextual tools rather than permanent top-level tabs.
- **Signals** — machine/system inbox for authenticated events now and future moderation/integration signals later.
- **Systems** — local companion/LAN health, trusted devices, incoming API, service checks and provider connection shells.
- **Settings** — appearance, workspace behaviour, local security and data controls.

The phone companion is deliberately smaller:

- **Home**
- **Add**
- **Work**
- **Signals**

Delivery, Bugs and Notes live inside Work instead of becoming separate permanent navigation items.

## Connected Workspace foundation

Deme Ops starts an in-process HTTP backend with the desktop app. It:

- supports localhost and private/link-local LAN sources only
- chooses a fallback port when the preferred port is busy
- requires strong paired-device bearer tokens for private endpoints
- persists only token hashes for paired devices
- uses short-lived pairing codes followed by explicit desktop approval
- blocks companion private access whenever the desktop is locked
- exposes Server-Sent Events for live update notifications
- stores paired-device configuration, incoming events and attachment metadata in Electron `userData`
- stores attachment files under a generated-ID attachment directory with path and size validation
- keeps `roadmap.json` canonical and uses revision-aware writes to prevent stale desktop saves overwriting companion changes

## Existing data and upgrade compatibility

0.6.1 keeps the internal application identity compatible with the existing install while changing the user-facing product and installer name to **Deme Ops**. Existing Roadmap data, `security.json`, paired devices, incoming events and attachments are not intentionally reset by the rebrand.

## Development

```bash
npm install
npm run dev
```

Validate QA, the mobile companion, TypeScript and the production renderer:

```bash
npm run build
```

Build the Windows installer:

```bash
npm run dist:win
```

The release installer is named `Deme-Ops-Setup-<version>.exe`.
