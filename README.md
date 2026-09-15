# Deme Roadmap

A calm, local-first Windows desktop roadmap for Deme. It keeps the useful part of a kanban board without turning planning into its own job.

## What it is

- A real Windows desktop application built with Electron + React.
- Local-first. No account, hosted database, Render service, or cloud sync is required.
- Five obvious stages: Ideas, Planned, In progress, Testing, Shipped.
- Focus view for the work that matters now.
- Drag and drop board.
- Releases automatically grouped from the release field on cards.
- Card details with area, priority, target date, description, and checklist.
- Archive, search, autosave, JSON backup, and restore.
- Deme-inspired dark visual language with lilac/pink accents rather than generic project-management green.

## Run it locally

```powershell
npm install
npm run dev
```

## Build the Windows installer

```powershell
npm install
npm run dist:win
```

The installer is written to `release/`. It creates normal Windows Start Menu and Desktop shortcuts.

## Where the roadmap is stored

Electron stores the live `roadmap.json` file in the app's Windows user-data directory. For a normal installation this is under `%APPDATA%\\Deme Roadmap`.

Use **Back up** inside the app whenever you want a portable JSON copy. **Restore** imports one of those copies and immediately makes it the active local roadmap.

## Keyboard shortcuts

- `Ctrl + K` focuses roadmap search.
- `Ctrl + N` creates a new item.
- `Esc` closes the item editor.
