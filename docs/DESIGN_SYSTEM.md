# Falcon Jobster — Green design system (v2.0.0 restoration)

Version 2.1.1 retains the full-stack logic from v2.1.0 but restores the **exact CSS from full-stack v2.0.0**.
No changes to backend endpoints, database schema, permissions, sync logic, or translations were made.

## Palette

| Variable | Color | Use |
| --- | --- | --- |
| `--ink` | `#24352e` | Primary text |
| `--muted` | `#78827b` | Muted text |
| `--line` | `#e1e6de` | Panel borders |
| `--teal` | `#277864` | Secondary brand green |
| `--dark` | `#183f35` | Sidebar and dark accents |
| `--soft` | `#eaf1e9` | Pale green panels |
| `--white` | `#fff` | Card backgrounds |
| `body` background | `#f5f6f2` | Workspace canvas |

The CSS remains in `src/styles.css`; no third-party fonts or images are loaded. The standalone
HTML in `dist/index.html` inlines this one stylesheet with existing JavaScript modules.

`src/theme-black-gold.css` is an empty compatibility stylesheet, retained solely so that
an unchanged backend's previously supported static asset URL still returns a valid response.
It is **not loaded** by either HTML entry point or included in the standalone build.

Both interface languages (English and Russian) are unchanged. Keep keyboard focus, responsive
breakpoints, and the 320 px scrollable kanban board when updating styles in the future.
