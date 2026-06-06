# AI customization guide

Use this folder with Codex CLI, Claude Code CLI, or another local coding assistant when you want to change the look and feel of the booking page.

Safe files to edit:

- `content/profile.md`
- `content/appointment-types/*.md`
- `content/default-copy.json`
- `assets/styles.css`
- `index.html`, only for layout and copy

Protected protocol files:

- `assets/app.js`
- `public/site-config.json`
- `public/availability/*.json`

Good prompts:

- Change the visual style without changing encryption, request, or availability code.
- Add a new appointment type by editing only Markdown.
- Set appointment weekly hours by editing `weekly_hours`, for example `mon=09:00-16:30;tue=09:00-16:30;fri=closed`.
- Change copy and colors while preserving the public artifact schema.
- Explain what files are safe to edit and what files should not be touched.

Before publishing, run `scripts/test-booking-site`. It checks that request encryption still happens before network submission and that the template does not add third-party scripts.
