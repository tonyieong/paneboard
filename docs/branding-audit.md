# Paneboard branding verification

Checked the `ai/task-2` worktree with the `ui-audit` skill on port **5022**.
The temporary instance was stopped and its configuration and workspace state
restored after the audit. No packaging, deployment, or service restart was run.

Automated validation: 298 focused tests passed, `npm run lint` passed, and the
complete `npm test` run passed all 600 tests with Node v24.14.0 from the normal
installation directory. Earlier runs resolving Node v24.13.0 through System32
hit HTTP startup timeouts and a stalled ConPTY test; the final run includes both
HTTP and terminal tests with no failures or skips.

- Dark/light contrast: no failures in the rendered audit workspace.
- Accessible names, keyboard focus rings, and browser console: no findings.
- Control geometry: no off-centre controls reported.
- Optical centring: six fully unoccluded controls measured, all bounding-box
  offsets below 0.6 px. Occluded controls were not measured; the script does not
  report the original candidate count.
- Responsive sweep: 41 widths, 320–1920 px. The two flagged workspace tabs at
  320/360 px sit in an `overflow-x: auto` strip (284 px content in 164/204 px
  containers). Independent computed-style checks confirmed zero document
  overflow. Long workspace and pane titles retain ellipsis truncation.
- The static audit's two new copy candidates contain the proper name
  “Paneboard”; they are not sentence-case defects. Existing motion and stacking
  candidates were outside the branding change.

Desktop, mobile, login, and settings screenshots were visually inspected.
The six images in `docs/screenshots/` use synthetic example content rendered by
the application. They are documentation examples, not terminal test reports.
The runtime audit used the worktree's isolated instance; Browser pane geometry
and external provider behavior were not covered by that audit.

The Windows ICO was successfully loaded with `System.Drawing.Icon`. Regenerate
the ICO and web PNG icons from `public/icon.svg` with
`node scripts/generate-icons.js` (requires the existing Playwright dependency
and Google Chrome). Packaged executable behavior was not tested, as packaging
was excluded from this task.

Old brand identifiers remain only where needed for migration/compatibility,
recorded protocol fixtures, and the existing GitHub repository URLs. Local
workspace folder names and ignored machine-specific instructions are unchanged.
