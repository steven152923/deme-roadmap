# Deme Roadmap

A local-first Windows desktop roadmap and release planner for Deme.

Deme Roadmap is deliberately simpler than Trello/Jira-style project-management suites: open it, see what matters, move work forward, close it. There is no account, hosted workspace or production-server dependency.

## Version 0.2

0.2 turns the original board prototype into a fuller product-planning application while keeping the UI quiet and understandable.

### Views

- **Focus** — active work, testing, overdue targets, blocked items, due-soon work, the active release and recent local activity.
- **Board** — Ideas → Planned → In progress → Testing → Shipped, with drag-and-drop and stable ordering.
- **Roadmap** — a multi-month timeline grouped by Deme product area, including release markers and unscheduled work.
- **Releases** — real release objects with status, target dates, goals and automatic shipped progress.
- **All items** — a compact sortable table for fast scanning.
- **Archive** — hide old or rejected work without destroying it.
- **Settings** — local behaviour, Deme product areas and backup/data controls.

### Roadmap items

Items support:

- description
- stage and product area
- Low / Normal / High / Critical priority
- XS–XL effort estimate
- release assignment
- start and target dates
- labels
- checklists
- blockers/dependencies
- external links
- private progress notes/updates
- pinning to Focus
- archive, restore, duplicate and permanent delete

### Desktop workflow

- `Ctrl + N` quick capture
- `Ctrl + K` command palette
- `Ctrl + F` roadmap search
- autosave to the Windows app-data directory
- atomic local JSON writes
- native backup/restore dialogs
- Show in folder from Settings
- NSIS installer with Desktop and Start Menu shortcuts

### 0.1 data migration

Existing 0.1 data is migrated in the renderer on first load. Legacy release text values are converted into 0.2 release objects and existing cards keep their content, stage, dates, checklists and archive state.

## Development

```bash
npm install
npm run dev
```

Typecheck and production renderer build:

```bash
npm run build
```

Build the Windows installer:

```bash
npm run dist:win
```

The app data file is kept under Electron's Windows `userData` directory as `roadmap.json`. The app does not require a remote database or Deme's production backend.
