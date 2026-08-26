const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const { Terminal: HeadlessTerminal } = require('@xterm/headless');

const coreAppSource = fs.readFileSync(path.join(__dirname, '..', 'public', 'app.js'), 'utf8');
const aiClientSource = fs.readFileSync(path.join(__dirname, '..', 'plugin-panes', 'claude', 'client.js'), 'utf8');
const codexClientSource = fs.readFileSync(path.join(__dirname, '..', 'plugin-panes', 'codex', 'client.js'), 'utf8');
const whiteboardClientPath = path.join(__dirname, '..', 'plugin-panes', 'whiteboard', 'client.js');
const whiteboardClientSource = fs.existsSync(whiteboardClientPath) ? fs.readFileSync(whiteboardClientPath, 'utf8') : '';
const appSource = `${coreAppSource}\n${aiClientSource}`;
const coreStyles = fs.readFileSync(path.join(__dirname, '..', 'public', 'styles.css'), 'utf8');
const aiStyles = fs.readFileSync(path.join(__dirname, '..', 'plugin-panes', 'claude', 'styles.css'), 'utf8');
const styles = `${coreStyles}\n${aiStyles}`;
const mainSource = fs.readFileSync(path.join(__dirname, '..', 'src', 'main.js'), 'utf8');
const claudeSource = fs.readFileSync(path.join(__dirname, '..', 'plugin-panes', 'claude', 'server.js'), 'utf8');
const codexSource = fs.readFileSync(path.join(__dirname, '..', 'plugin-panes', 'codex', 'server.js'), 'utf8');
const aiSource = `${claudeSource}\n${codexSource}`;
const configSource = fs.readFileSync(path.join(__dirname, '..', 'src', 'config.js'), 'utf8');
const browserSource = fs.readFileSync(path.join(__dirname, '..', 'src', 'browser.js'), 'utf8');
const manifest = fs.readFileSync(path.join(__dirname, '..', 'public', 'manifest.webmanifest'), 'utf8');
const indexSource = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');
const i18nSource = fs.readFileSync(path.join(__dirname, '..', 'public', 'i18n.js'), 'utf8');

function settingsSection(id) {
  const start = appSource.indexOf(`<section class="settings-section`, appSource.indexOf(`id="${id}"`) - 200);
  const end = appSource.indexOf('</section>', start);
  return appSource.slice(start, end);
}

test('mobile display mode uses the current two-column navigation layout', () => {
  assert.match(styles, /\.app\.mode-mobile\s*\{\s*grid-template-columns:\s*0 minmax\(0, 1fr\)/);
  assert.match(styles, /\.app\.mode-mobile \.workspace\s*\{\s*grid-column:\s*2/);
});

test('installed mobile app uses fullscreen display without a browser address bar', () => {
  assert.equal(JSON.parse(manifest).display, 'fullscreen');
  assert.match(indexSource, /apple-mobile-web-app-capable" content="yes"/);
  assert.match(appSource, /navigator\.serviceWorker\.register\('\/service-worker\.js'\)/);
});

test('terminal fills its pane without decorative outer padding', () => {
  assert.match(styles, /\.terminal\s*\{\s*padding:\s*0/);
});

test('obsolete pane history and fixed service status are absent', () => {
  assert.doesNotMatch(appSource, /data-pane-history|openPaneHistory|Service online|Local service online/);
  assert.doesNotMatch(mainSource, /\/api\/panes\/:paneId\/history/);
});

test('obsolete TUI pane mode is absent', () => {
  assert.doesNotMatch(appSource, /data-pane-mode|togglePaneMode|Toggle TUI mode/);
  assert.doesNotMatch(mainSource, /\/api\/panes\/:paneId\/mode/);
});

test('collapsed navigation controls have explicit accessible names', () => {
  assert.match(appSource, /class="rail-button sidebar-brand"[^>]+aria-label="Toggle sidebar"/);
  assert.match(appSource, /data-theme-toggle aria-label="Switch to \$\{themeMode\(\)/);
});

test('the theme toggle button shows the currently active mode, not the switch target', () => {
  assert.match(appSource, /<span class="rail-icon" aria-hidden="true">\$\{themeMode\(\) === 'dark' \? '☾' : '☀'\}<\/span><span class="rail-label">\$\{themeMode\(\) === 'dark' \? 'Dark mode' : 'Light mode'\}<\/span>/);
  const setThemeLiveSource = appSource.slice(appSource.indexOf('async function setThemeLive'), appSource.indexOf('function wirePaneGrid'));
  assert.match(setThemeLiveSource, /const modeLabel = dark \? 'Dark mode' : 'Light mode'/);
  assert.match(setThemeLiveSource, /icon\.textContent = dark \? '☾' : '☀'/);
  assert.match(setThemeLiveSource, /label\.textContent = modeLabel/);
});

test('settings sits above the theme toggle in a shorter sidebar footer', () => {
  const footerSource = appSource.slice(appSource.indexOf('<footer class="sidebar-footer">'), appSource.indexOf('</footer>'));
  const settingsIndex = footerSource.indexOf('data-action="settings"');
  const themeToggleIndex = footerSource.indexOf('data-theme-toggle');
  assert.ok(settingsIndex !== -1 && themeToggleIndex !== -1 && settingsIndex < themeToggleIndex);
  assert.match(styles, /\.sidebar-footer \.rail-button\s*\{[^}]*min-height:\s*28px/s);
  assert.match(styles, /\.sidebar-footer\s*\{\s*padding:\s*6px 10px 8px/);
});

test('appearance settings persist the selected interface language locally', () => {
  assert.match(appSource, /<label>Language<select data-language-select>/);
  assert.match(appSource, /value="zh-HK"[^>]*>繁體中文（香港）<\/option>/);
  assert.match(appSource, /window\.Wps7I18n\.setLocale\(event\.currentTarget\.value\)/);
});

test('terminal scrollback is a fixed internal limit, not a setting', () => {
  assert.match(appSource, /const TERMINAL_SCROLLBACK_LINES = 100000;/);
  assert.match(appSource, /scrollback:\s*TERMINAL_SCROLLBACK_LINES/);
  // Neither scrollback limit may come back as a form field.
  assert.doesNotMatch(appSource, /persistence\.scrollback_lines|terminal\.reconnect_scrollback_lines/);
});

test('workspace header keeps shortcut controls in the sidebar only', () => {
  assert.doesNotMatch(appSource, /toolbar-button help-button/);
});

test('the sidebar shortcuts feature has been removed', () => {
  assert.doesNotMatch(appSource, /openHelp|data-action="help"|help-overlay|help-dialog-title/);
  assert.doesNotMatch(styles, /\.help-overlay|\.help-panel|\.help-header|\.help-list/);
});

test('workspace tabs and terminal grid use the compact edge-to-edge layout', () => {
  assert.match(styles, /\.workspace\s*\{\s*grid-template-rows:\s*auto minmax\(0, 1fr\) 36px/);
  // A tab is as wide as its own title plus the close button, never stretched to
  // a floor and never shrunk below its content; the strip scrolls instead.
  assert.match(styles, /\.tab\s*\{[^}]*width:\s*max-content;\s*min-width:\s*0;\s*max-width:\s*220px;\s*flex:\s*0 0 auto/s);
  assert.match(styles, /\.pane-grid\s*\{[^}]*border:\s*0/s);
});

test('workspace tabs sit below the board, WPS-sheet style, with a scrollbar mirroring its scroll position', () => {
  assert.match(styles, /\.tabs\s*\{\s*grid-row:\s*3/);
  assert.match(styles, /\.pane-grid\s*\{\s*grid-row:\s*2/);
  assert.match(styles, /\.desktop-mode-banner\s*\{\s*grid-row:\s*1/);
  assert.match(appSource, /<div class="pane-grid" data-pane-grid[^>]*>[\s\S]*<\/div>\s*<header class="tabs">/);
  assert.match(appSource, /data-board-hscroll-track[\s\S]*?data-board-hscroll-thumb/);
});

test('mobile moves the workspace tabs to the top of the screen and drops the board scrollbar', () => {
  assert.match(styles, /\.app\.mode-mobile \.workspace,\s*\.app\.mobile-device \.workspace\s*\{[^}]*grid-template-rows:\s*42px auto minmax\(0, 1fr\)/s);
  assert.match(styles, /\.app\.mode-mobile \.tabs,\s*\.app\.mobile-device \.tabs\s*\{[^}]*grid-row:\s*1/s);
  assert.match(styles, /\.app\.mode-mobile \.pane-grid,\s*\.app\.mobile-device \.pane-grid\s*\{\s*grid-row:\s*3/s);
  assert.match(styles, /\.app\.mode-mobile \.board-hscroll,\s*\.app\.mobile-device \.board-hscroll\s*\{[^}]*display:\s*none/s);
  // The row moved above the board, so its border and the tab corners flip with it.
  assert.match(styles, /\.app\.mode-mobile \.tabs,\s*\.app\.mobile-device \.tabs\s*\{[^}]*border-top:\s*0[^}]*border-bottom:\s*1px solid var\(--line\)/s);
  assert.match(styles, /\.app\.mode-mobile \.tab,\s*\.app\.mobile-device \.tab\s*\{[^}]*border-radius:\s*8px 8px 0 0/s);
});

test('the workspace title row splits into equal thirds', () => {
  // Tabs own the first third, the board scrollbar the last, and the middle is
  // left empty, so neither end can eat the other's space.
  assert.match(styles, /\.tabs \{[^}]*display:\s*grid;\s*grid-template-columns:\s*repeat\(3, minmax\(0, 1fr\)\)/s);
  assert.match(appSource, /<div class="workspace-bar">[\s\S]*?<div class="tabs-gap">[\s\S]*?<div class="board-hscroll"/);
  // The scrollbar fills its own third now rather than being squeezed to a stub,
  // so it no longer needs the sticky pinning that a scrolling row demanded.
  assert.doesNotMatch(styles, /\.board-hscroll \{[^}]*position:\s*sticky/s);
  assert.doesNotMatch(styles, /\.board-hscroll \{[^}]*max-width:\s*520px/s);
  // Mobile hides the scrollbar, so there is no third to balance against.
  assert.match(styles, /\.app\.mode-mobile \.tabs,\s*\.app\.mobile-device \.tabs\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\)/s);
  assert.match(styles, /\.app\.mode-mobile \.tabs-gap,\s*\.app\.mobile-device \.tabs-gap\s*\{\s*display:\s*none/s);
});

test('workspaces read left to right and the strip stays where it was put', () => {
  // Nothing centres or chases the active workspace any more, so the only reason
  // the strip ever moves is the arrows or the user's own hand. A re-render would
  // otherwise rebuild it back at the first workspace.
  assert.doesNotMatch(appSource, /centerActiveWorkspaceTab/);
  assert.doesNotMatch(appSource, /strip\.style\.paddingLeft/);
  assert.match(appSource, /ensureActivePaneVisible\('auto'\);\s*restoreWorkspaceStripScroll\(\);/);
  const restore = appSource.slice(appSource.indexOf('function restoreWorkspaceStripScroll'), appSource.indexOf('function updateWorkspaceStripOverflow'));
  assert.match(restore, /strip\.scrollLeft = state\.workspaceStripScroll/);
  assert.match(appSource, /workspaceStripScroll: 0/);
  // The hints live on the wrapper: on the scroller itself they would scroll off.
  assert.match(styles, /\.workspace-strip-wrap::before,\s*\.workspace-strip-wrap::after\s*\{\s*content:\s*"…"/s);
  assert.match(styles, /\.workspace-strip-wrap\.overflow-left::before,\s*\.workspace-strip-wrap\.overflow-right::after\s*\{\s*display:\s*flex/s);
  const overflow = appSource.slice(appSource.indexOf('function updateWorkspaceStripOverflow'), appSource.indexOf('function scrollWorkspaceStrip'));
  assert.match(overflow, /classList\.toggle\('overflow-left', strip\.scrollLeft > 1\)/);
  assert.match(overflow, /classList\.toggle\('overflow-right', remaining > 1\)/);
});

test('the workspace arrows scroll the strip one title at a time', () => {
  // They pan the view now; they no longer switch workspace.
  assert.doesNotMatch(appSource, /switchWorkspaceByOffset/);
  assert.match(appSource, /data-workspace-nav="-1"[^>]*aria-label="Scroll workspaces left"/);
  assert.match(appSource, /data-workspace-nav="1"[^>]*aria-label="Scroll workspaces right"/);
  assert.match(appSource, /button\.onclick = \(\) => scrollWorkspaceStrip\(Number\(button\.dataset\.workspaceNav\)\)/);
  const scroll = appSource.slice(appSource.indexOf('function scrollWorkspaceStrip'), appSource.indexOf('const WORKSPACE_DRAG_HOLD_MS'));
  // The next tab edge off the side being scrolled towards, so no title is skipped.
  assert.match(scroll, /\.filter\(\(left\) => left < strip\.scrollLeft - 1\)/);
  assert.match(scroll, /\.filter\(\(left\) => left > strip\.scrollLeft \+ 1\)/);
  assert.match(scroll, /strip\.scrollTo\(\{ left: Number\.isFinite\(target\) \? target : strip\.scrollLeft, behavior: 'smooth' \}\)/);
  // Each arrow stops once there is nothing left that way.
  const overflow = appSource.slice(appSource.indexOf('function updateWorkspaceStripOverflow'), appSource.indexOf('function scrollWorkspaceStrip'));
  assert.match(overflow, /\[data-workspace-nav="-1"\]'\)\.disabled = strip\.scrollLeft <= 1/);
  assert.match(overflow, /\[data-workspace-nav="1"\]'\)\.disabled = remaining <= 1/);
});

test('a workspace title can be dragged to reorder it, and a touch must hold first', () => {
  assert.match(appSource, /data-tab-session="\$\{item\.id\}" data-workspace-drag/);
  assert.match(appSource, /tab\.onpointerdown = startWorkspaceTabDrag/);
  const drag = appSource.slice(appSource.indexOf('function startWorkspaceTabDrag'), appSource.indexOf('function narrowViewport'));
  // The close button and the rename box own their own pointers.
  assert.match(drag, /event\.target\.closest\('\[data-close-session\], input'\)/);
  // A touch drags only after holding still; moving first scrolls the strip.
  assert.match(drag, /if \(event\.pointerType === 'touch'\) \{\s*hold = setTimeout\(begin, WORKSPACE_DRAG_HOLD_MS\);/);
  assert.match(drag, /if \(hold && travelled > 6\) \{\s*finish\(\);/);
  // Taking a new slot moves the tab by the width of what it just passed, so the
  // pointer's origin travels the same distance. Rebasing anything else left the
  // tab that far ahead of the pointer, onto the next title, and the next, until
  // it fetched up against the far edge.
  assert.match(drag, /strip\.insertBefore\(tab, before \|\| null\)/);
  assert.match(drag, /startX \+= tab\.offsetLeft - settled/);
  // Both the tab's slot and the offset it is drawn at come from the live
  // positions, so nothing has to be kept in step with them by hand.
  assert.match(drag, /const min = anchor - tab\.offsetLeft/);
  assert.match(drag, /const centre = tab\.offsetLeft \+ tab\.offsetWidth \/ 2 \+ offset\(pointerX\)/);
  // The strip clips its overflow, so a dragged tab is held inside the visible
  // run rather than disappearing past an edge.
  assert.match(drag, /return Math\.max\(min, Math\.min\(max, pointerX - startX\)\)/);
  // Reordering has to run before the tab is drawn: the other way round spends a
  // frame with the new slot and the old offset, which reads as a jump.
  assert.match(drag, /reorder\(moveEvent\.clientX\);\s*tab\.style\.transform = `translateX\(\$\{offset\(moveEvent\.clientX\)\}px\)`/);
  // Tabs ease their transform for the press effect. Under the pointer that
  // easing lags the correction for a swap, throwing the tab a title ahead for
  // those frames, so a dragged tab opts out of it.
  assert.match(styles, /\.workspace-strip \.tab\.dragging\s*\{[^}]*transition:\s*none/s);
  // The title being passed moves a whole width at once; FLIP slides it from
  // where it was instead of teleporting it.
  assert.match(drag, /const wasAt = new Map\(others\.map\(\(item\) => \[item, item\.offsetLeft\]\)\)/);
  assert.match(drag, /const shift = from - item\.offsetLeft/);
  assert.match(drag, /item\.style\.transition = 'none';\s*item\.style\.transform = `translateX\(\$\{shift\}px\)`;\s*requestAnimationFrame/);
  // Whatever is still mid-slide when the drag ends gets put back in its slot.
  assert.match(drag, /for \(const item of strip\.querySelectorAll\('\.tab'\)\) \{\s*item\.style\.transition = '';\s*item\.style\.transform = '';/);
});

// Held past an end, the strip comes to meet the drag, so a workspace can be
// carried to a slot that started off screen.
test('the strip auto-scrolls at a fixed rate per frame, not per pointer event', () => {
  const drag = appSource.slice(appSource.indexOf('function startWorkspaceTabDrag'), appSource.indexOf('function narrowViewport'));
  assert.match(appSource, /const EDGE_SCROLL_PX = 6;/);
  // Per frame, not per pointer event: a mouse reports dozens of times a second,
  // and driving this from those events scrolled the strip to its end at once.
  assert.match(drag, /const edgeScroll = \(\) => \{\s*scrolling = requestAnimationFrame\(edgeScroll\)/);
  assert.match(drag, /scrolling = requestAnimationFrame\(edgeScroll\);\s*tab\.classList\.add\('dragging'\)|tab\.classList\.add\('dragging'\);[\s\S]*?scrolling = requestAnimationFrame\(edgeScroll\)/);
  assert.match(drag, /cancelAnimationFrame\(scrolling\)/);
  // Only once the pointer is actually past an edge, with no inset margin that
  // would start it while the pointer is still over the strip.
  assert.match(drag, /Math\.max\(pointerX - bounds\.right, 0\) - Math\.max\(bounds\.left - pointerX, 0\)/);
  assert.match(drag, /if \(!past \|\| next === anchor\) \{\s*return;/);
  // The slots slide under the tab, so the pointer's origin slides with them.
  assert.match(drag, /startX -= next - anchor/);
  assert.match(drag, /anchor = next;\s*strip\.scrollLeft = anchor;\s*reorder\(pointerX\)/);
  // The strip is pinned for the whole drag. Scrolling it from inside the move
  // handler ran once per pointer event, which raced the tab to the far end
  // instead of leaving it under the pointer.
  assert.match(drag, /anchor = strip\.scrollLeft/);
  assert.match(drag, /strip\.scrollLeft = anchor/);
  assert.doesNotMatch(drag, /anchor = Math\./);
  // The pointer that finished a drag must not also select the workspace.
  assert.match(drag, /state\.suppressSessionClickUntil = Date\.now\(\) \+ 300/);
  assert.match(drag, /\/api\/sessions\/\$\{tab\.dataset\.tabSession\}\/move/);
  assert.match(mainSource, /app\.post\('\/api\/sessions\/:sessionId\/move'/);
  assert.match(styles, /\.workspace-strip \.tab\.dragging\s*\{/);
  // Smooth scrolling belongs to the arrows; a drag would lag a frame behind.
  assert.match(styles, /\.workspace-strip:not\(\.reordering\)\s*\{\s*scroll-behavior:\s*smooth/s);
});

test('the board always keeps a few empty columns past the rightmost pane', () => {
  assert.match(appSource, /function boardExtent\(panes\)/);
  assert.match(appSource, /class="board-reserve"[^>]*grid-column:\s*\$\{boardExtent\(tab\.panes\) \+ BOARD_RESERVE_COLUMNS\}/);
  assert.match(appSource, /function syncBoardMetrics\(tab\)/);
});

test('sidebar brand is the dedicated collapse control', () => {
  assert.match(appSource, /class="rail-button sidebar-brand"[^>]+data-action="toggle"[^>]+aria-label="Toggle sidebar"/);
  assert.doesNotMatch(appSource, /data-action="toggle"[^>]+title="Sessions"/);
  assert.match(appSource, /<span class="rail-brand-mark" aria-hidden="true">W7<\/span><span class="rail-label">WPS7<\/span>/);
});

test('sidebar keeps only a divider above pane tabs and lists every tab on a flat row', () => {
  assert.doesNotMatch(appSource, /class="sidebar-header"/);
  assert.doesNotMatch(appSource, />Sessions<|>Persistent workspaces</);
  assert.match(appSource, /class="sidebar-divider" aria-hidden="true"/);
  assert.match(appSource, /function sidebarPaneRows\(\)/);
  const rowsSource = appSource.slice(appSource.indexOf('function sidebarPaneTabs'), appSource.indexOf('function renderSidebarPaneItem'));
  // Every row names its own workspace, with no indent or tree branch to decode.
  assert.match(rowsSource, /paneTabs\(pane\)\.map\(\(tab\) => \(\{ tabId: tab\.id, tabKind: paneTabKind\(pane\), label: paneTabLabel\(pane, tab\) \}\)\)/);
  assert.match(rowsSource, /browserTabs[\s\S]*?tab\.title \|\| 'New tab'/);
  assert.match(rowsSource, /notepadTabs[\s\S]*?notepadTabLabel\(tab\)/);
  assert.match(rowsSource, /label: `\$\{session\.name\}\/\$\{label\}`/);
  assert.match(appSource, /data-sidebar-pane-tab="\$\{tabId\}" data-sidebar-pane-tab-kind="\$\{tabKind\}"/);
  const linksSource = appSource.slice(appSource.indexOf('function wirePaneLinks'), appSource.indexOf('function findAll'));
  assert.match(linksSource, /activateSidebarPaneTab\(button\.dataset\.paneLink, button\.dataset\.sidebarPaneTabKind, button\.dataset\.sidebarPaneTab\)/);
  assert.doesNotMatch(rowsSource, /└─|├─|branch/);
  assert.doesNotMatch(appSource, /session-branch/);
  assert.doesNotMatch(styles, /session-branch/);
});

test('sidebar actions use shared icons for new PowerShell and new file', () => {
  assert.match(appSource, /data-action="new-powershell"[^>]+aria-label="New PowerShell pane"[^>]*>\s*<span class="rail-icon" aria-hidden="true">\$\{fileActionIcon\('terminal'\)\}<\/span><span class="rail-label">New PowerShell pane<\/span>/);
  assert.match(appSource, /data-action="files"[^>]+aria-label="New file pane"[^>]*>\s*<span class="rail-icon" aria-hidden="true">\$\{fileActionIcon\('file'\)\}<\/span><span class="rail-label">New file pane<\/span>/);
  assert.match(appSource, /\[data-action="new-powershell"\][^\n]+createPane/);
});

test('pane titles reuse the same pane-type icons as the sidebar', () => {
  assert.match(appSource, /class="pane-kind-icon"[^>]*>\$\{fileActionIcon\(paneKindIcon\(pane\)\)\}<\/span>/);
  assert.match(appSource, /class="pane-kind-icon"[^>]*>\$\{fileActionIcon\(pane\.type === 'files' \? 'file' : pane\.type === 'ai' \? 'ai' : paneShell\(pane\) === 'cmd' \? 'cmd' : 'terminal'\)\}<\/span>/);
  assert.match(styles, /\.pane-kind-icon \.file-action-icon\s*\{[^}]*width:\s*14px[^}]*height:\s*14px/s);
  assert.match(styles, /\.pane-title::before\s*\{[^}]*content:\s*none/s);
});

test('long pane titles keep the close button visible immediately while resizing', () => {
  assert.match(appSource, /\$\{header\}\s*\$\{pane\.type === 'usage'[\s\S]*?\}\s*<button class="pane-close" data-close-pane="\$\{pane\.id\}"/);
  // 30px matches the tabbed strips and still clears the close button, which
  // occupies 28px (22px wide at right: 6px).
  assert.match(styles, /\.pane-title\s*\{[^}]*padding:\s*0 30px 0 8px/s);
  assert.match(styles, /\.pane-title\s*\{[^}]*width:\s*100%[^}]*max-width:\s*100%[^}]*contain:\s*inline-size[^}]*transition:\s*none/s);
  assert.match(styles, /\.pane-title \[data-rename-pane\]\s*\{[^}]*width:\s*100%/s);
  assert.match(styles, /\.pane-close,\s*\.pane-usage-refresh\s*\{[^}]*position:\s*absolute[^}]*top:\s*3px[^}]*right:\s*6px[^}]*z-index:\s*6/s);
  assert.match(appSource, /function syncPaneTitleWidth\(paneElement\)/);
  assert.match(appSource, /paneElement\.clientWidth[\s\S]*?label\.style\.maxWidth/);
  assert.match(appSource, /function applyPaneLayoutStyle[\s\S]*?syncPaneTitleWidth\(paneElement\)/);
});

test('each pane supports independent Ctrl zoom controls', () => {
  assert.match(appSource, /function paneFontSize\(pane\)/);
  assert.match(appSource, /function changePaneFontSize\(paneId, delta\)/);
  assert.match(appSource, /event\.ctrlKey && event\.shiftKey \? event\.target\.closest\?\.\('\[data-pane\]'\)[\s\S]*?changePaneFontSize\(paneEl\.dataset\.pane, event\.deltaY/);
  assert.match(appSource, /key === '\+' \|\| key === '='/);
  assert.match(appSource, /--pane-font-size/);
  assert.match(appSource, /body:\s*JSON\.stringify\(\{ fontSize: nextSize \}\)/);
});

test('settings separate PowerShell, file pane, and system font sizes', () => {
  assert.match(appSource, /System font size<input name="ui\.system_font_size"/);
  assert.match(appSource, /PowerShell font size<input name="ui\.terminal_font_size"/);
  assert.match(appSource, /File pane font size<input name="ui\.file_pane_font_size"/);
  assert.match(appSource, /system_font_size:\s*numberOrUndefined\(form\.get\('ui\.system_font_size'\)\)/);
  assert.match(appSource, /file_pane_font_size:\s*numberOrUndefined\(form\.get\('ui\.file_pane_font_size'\)\)/);
  assert.match(appSource, /--system-font-size/);
  assert.match(appSource, /--file-pane-font-size/);
  assert.match(styles, /\.files-pane\s*\{[^}]*font-size:\s*var\(--pane-font-size, var\(--file-pane-font-size\)\)/s);
  assert.match(styles, /\.session-item[\s\S]*?font-size:\s*var\(--system-font-size/s);
});

test('a new pane\'s default height is configurable and capped at rows per screen', () => {
  assert.match(appSource, /New pane height \(cells\)<input name="ui\.default_pane_height" type="number" min="1" max="\$\{escapeAttr\(settings\.ui\.vertical_slots\)\}"/);
  assert.match(appSource, /default_pane_height:\s*numberOrUndefined\(form\.get\('ui\.default_pane_height'\)\)/);
});

test('settings hide internal sidebar and file-manager switches and use clear shared icons', () => {
  assert.doesNotMatch(appSource, /Sidebar width<input/);
  assert.doesNotMatch(appSource, /File manager enabled<\/label>/);
  assert.match(appSource, /aria-label="Terminal"[^>]*>\s*<span class="settings-nav-icon"[^>]*>\$\{fileActionIcon\('terminal'\)\}/);
  assert.match(appSource, /aria-label="Files"[^>]*>\s*<span class="settings-nav-icon"[^>]*>\$\{fileActionIcon\('file'\)\}/);
  for (const icon of ['appearance', 'workspace', 'shell', 'server']) {
    assert.match(appSource, new RegExp(`fileActionIcon\\('${icon}'\\)`));
  }
  assert.match(styles, /\.settings-nav-icon \.file-action-icon\s*\{/);
});

test('server access uses Local and LAN choices with password-gated automatic restart', () => {
  assert.match(appSource, /<select name="server\.host">/);
  assert.match(appSource, /value="127\.0\.0\.1"[^>]*>Local</);
  assert.match(appSource, /value="0\.0\.0\.0"[^>]*>LAN</);
  assert.doesNotMatch(appSource, /Host<input name="server\.host"/);
  assert.match(appSource, /const switchingToLan = payload\.server\.host === '0\.0\.0\.0'/);
  assert.match(appSource, /settings\.auth\?\.password_set \|\| Boolean\(payload\.auth\?\.password\)/);
  assert.match(appSource, /Set a password before enabling LAN access/);
  assert.match(appSource, /payload\.restart_after_save = switchingToLan/);
  assert.match(mainSource, /restart_after_save === true/);
  assert.match(mainSource, /stopRuntime\(\{ restart: true \}\)/);
});

test('pane grid settings resize existing panes immediately without rebuilding terminals', () => {
  const source = appSource.slice(appSource.indexOf('function applyConfigLive()'), appSource.indexOf('function escapeHtml'));
  assert.match(source, /for \(const pane of tab\.panes\)/);
  assert.match(source, /normalizePaneLayout\(pane\.layout\)/);
  assert.match(source, /applyPaneLayoutStyle\(document\.querySelector\(`\[data-pane="\$\{pane\.id\}"\]`\), pane\.layout\)/);
  assert.doesNotMatch(source, /render\(\)|loadState\(\)/);
});

test('TUI output hides intermediate cursor positions until a redraw burst settles', () => {
  assert.match(appSource, /function createTerminalWriter\(term, element\)/);
  assert.match(appSource, /term\.buffer\.active\.type === 'alternate'/);
  assert.match(appSource, /classList\.add\('terminal-updating'\)/);
  assert.match(appSource, /classList\.remove\('terminal-updating'\)/);
  assert.match(styles, /\.terminal\.terminal-updating \.xterm-cursor-layer\s*\{[^}]*opacity:\s*0/s);
});

test('workspace exposes browser panes with URL history, bookmarks and an embedded viewport', () => {
  assert.match(appSource, /data-action="browser"[^>]+aria-label="New browser pane"/);
  assert.match(appSource, /function renderBrowserPane\(pane\)/);
  assert.match(appSource, /data-browser-url-form/);
  assert.match(appSource, /Current[\s\S]*History[\s\S]*Bookmark/);
  assert.doesNotMatch(appSource, /<iframe class="browser-frame"/);
  assert.match(appSource, /<canvas class="browser-surface"/);
  assert.match(appSource, /<video class="browser-video"[^>]+playsinline/);
  assert.match(appSource, /data-browser-input-surface/);
  assert.match(appSource, /data-browser-emulation-mode/);
  assert.match(appSource, /data-browser-audio-toggle/);
  assert.match(appSource, /mode=browser/);
  assert.match(appSource, /data-browser-forward/);
  assert.match(appSource, /type: 'mouse'/);
  assert.match(appSource, /type: 'key'/);
  assert.match(appSource, /type: 'touch'/);
  assert.match(appSource, /type: 'keyboardFocus'/);
  assert.match(appSource, /message\.type === 'keyboardFocus'/);
  assert.doesNotMatch(appSource, /if \(isMobileLayout\(\)\) keyboard\.focus/);
  assert.match(appSource, /new RTCPeerConnection/);
  assert.match(appSource, /type: 'rtcAnswer'/);
  assert.match(appSource, /type: 'rtcIceCandidate'/);
  assert.match(appSource, /message\.type === 'streamMode'/);
  assert.match(appSource, /data-browser-context-menu/);
  assert.match(appSource, /navigator\.clipboard\.writeText/);
  assert.match(appSource, /navigator\.clipboard\.readText/);
  assert.match(browserSource, /window\.getSelection\(\)\.toString\(\)/);
  assert.match(browserSource, /Input\.insertText/);
  assert.match(browserSource, /Input\.dispatchTouchEvent/);
  assert.match(browserSource, /navigator\.mediaDevices\.getDisplayMedia/);
  assert.match(browserSource, /type: 'webrtcOffer'/);
  assert.match(browserSource, /mode: 'jpeg'/);
  assert.match(appSource, /data-browser-tab-strip/);
  assert.match(appSource, /data-browser-new-tab/);
  assert.match(appSource, /data-browser-close-tab/);
  assert.match(appSource, /type: 'activateTab'/);
  assert.match(appSource, /type: 'find'/);
  assert.match(appSource, /type: 'zoom'/);
  assert.match(appSource, /data-browser-zoom-toggle[^>]*aria-label="Zoom controls"/);
  assert.match(appSource, /data-browser-zoom-popover[^>]*role="dialog"/);
  assert.match(appSource, /data-browser-zoom-out/);
  assert.match(appSource, /data-browser-zoom-in/);
  assert.match(appSource, /data-browser-zoom-reset/);
  assert.match(appSource, /data-browser-zoom-value/);
  assert.match(appSource, /event\.ctrlKey \|\| event\.metaKey[\s\S]*?event\.deltaY < 0 \? 0\.1 : -0\.1/);
  assert.match(appSource, /shortcut === '\+' \|\| shortcut === '='/);
  assert.match(appSource, /shortcut === '-'/);
  assert.match(styles, /\.browser-zoom-control\s*\{[^}]*position:\s*relative/s);
  assert.match(styles, /\.browser-zoom-popover\s*\{[^}]*position:\s*absolute/s);
  assert.match(browserSource, /Page\.javascriptDialogOpening/);
  assert.match(browserSource, /Page\.windowOpen/);
  assert.match(browserSource, /Page\.fileChooserOpened/);
  assert.match(browserSource, /Browser\.downloadWillBegin/);
  assert.match(browserSource, /Fetch\.enable/);
  assert.match(browserSource, /Fetch\.failRequest/);
  assert.match(browserSource, /metadata\?\.deviceHeight \|\| this\.viewport\.height/);
  assert.match(appSource, /function browserViewportSize\(viewport\)/);
  assert.match(appSource, /height: Number\(message\.viewportHeight\) \|\| remoteViewport\.height/);
  assert.doesNotMatch(appSource, /message\.viewportHeight !== expected\.height/);
  assert.match(styles, /\.browser-pane\s*\{[^}]*height:\s*100%/s);
  assert.match(styles, /\.browser-toolbar\s*\{[^}]*grid-row:\s*1/s);
  assert.match(styles, /\.browser-find-bar\s*\{[^}]*grid-row:\s*2/s);
  assert.match(styles, /\.browser-viewport\s*\{[^}]*grid-row:\s*3/s);
  assert.match(mainSource, /\/api\/browser\/upload/);
  assert.match(mainSource, /\/api\/browser\/downloads\/:guid/);
  assert.match(mainSource, /browserManager\.attach\(paneId, ws\)/);
  assert.match(mainSource, /\/api\/panes\/:paneId\/browser/);
  assert.match(mainSource, /\/api\/browser\/bookmarks/);
  assert.match(appSource, /name="url" type="text"/);
  assert.match(appSource, /data-browser-url-choice/);
  assert.match(appSource, /data-browser-bookmark/);
  assert.match(mainSource, /function normalizeWebsite\(value\)/);
  assert.match(mainSource, /`https:\/\/\$\{input\}`/);
  assert.match(mainSource, /`http:\/\/\$\{input\}`/);
  assert.match(mainSource, /localhost\|127/);
});

test('browser tabs replace the browser pane title at the shared title height', () => {
  assert.match(appSource, /pane\.type === 'browser'[\s\S]*?class="browser-tab-strip"[\s\S]*?data-pane-title="\$\{pane\.id\}"[\s\S]*?fileActionIcon\('browser'\)/);
  assert.doesNotMatch(appSource, /function renderBrowserPane\(pane\)[\s\S]*?<div class="browser-tab-strip"/);
  assert.match(styles, /\.pane\s*\{[^}]*grid-template-rows:\s*auto minmax\(0, 1fr\)/s);
  assert.match(styles, /\.browser-tab-strip\s*\{[^}]*height:\s*var\(--pane-toolbar-height\)[^}]*padding:\s*2px 30px 0 8px/s);
  assert.match(appSource, /data-browser-new-tab[^>]*>\$\{fileActionIcon\('add'\)\}<\/button>/);
  assert.match(appSource, /data-notepad-new-tab[^>]*>\$\{fileActionIcon\('add'\)\}<\/button>/);
});

test('close buttons use the same single-stroke icon family as the new-tab button', () => {
  for (const attribute of ['data-pane-close-tab', 'data-browser-close-tab', 'data-notepad-close-tab']) {
    assert.match(appSource, new RegExp(`${attribute}="\\$\\{tab\\.id\\}">\\$\\{fileActionIcon\\('close'\\)\\}</button>`));
  }
  assert.match(appSource, /data-close-pane="\$\{pane\.id\}" title="Close pane">\$\{fileActionIcon\('close'\)\}<\/button>/);
  assert.doesNotMatch(appSource, /close-tab="\$\{tab\.id\}">×/);
  assert.match(styles, /\.pane-tab-close \.file-action-icon,[\s\S]*?\.notepad-tab-close \.file-action-icon\s*\{[^}]*width:\s*11px/s);
  // Every terminal tab keeps a close button; closing the last one restarts the shell.
  assert.doesNotMatch(appSource, /const closable =/);
});

test('browser tab strip keeps its icon after tab updates and the surface fills the viewport', () => {
  // The browser icon lives inside renderBrowserTabs so tab-strip re-renders keep it.
  assert.match(appSource, /function renderBrowserTabs\(pane\)[\s\S]*?<span class="pane-kind-icon" aria-hidden="true">\$\{fileActionIcon\('browser'\)\}<\/span>/);
  assert.match(appSource, /strip\.innerHTML = renderBrowserTabs\(found\.pane\)/);
  // The JPEG canvas fills the box like the WebRTC video, so no letterbox bars appear.
  assert.match(styles, /\.browser-surface\s*\{[^}]*object-fit:\s*fill/s);
  // Pointer mapping is a single proportional map for both stream modes (no contain offset math).
  assert.doesNotMatch(appSource, /const renderedWidth = contentWidth \* scale/);
  assert.match(appSource, /const pointerPosition = \(event\) => \{\s*const rect = inputSurface\.getBoundingClientRect\(\);[\s\S]*?event\.clientX - rect\.left\) \/ Math\.max\(1, rect\.width\) \* contentWidth/);
});

test('browser panes coalesce pointer moves to one per frame', () => {
  // A 125Hz pointer produces moves faster than the remote page consumes them, so
  // sending every one only grows a queue the user then waits on.
  assert.match(appSource, /pointerMoveFrame = requestAnimationFrame\(flushPointerMove\)/);
  assert.match(appSource, /const flushPointerMove = \(\) => \{[\s\S]*?sendMouse\('mouseMoved'/);
  assert.match(appSource, /dispose\(\) \{[\s\S]*?cancelAnimationFrame\(pointerMoveFrame\)/);
  // A queued move must never land after the press, release or wheel that followed it.
  assert.match(appSource, /flushPointerMove\(\);\s*sendMouse\('mousePressed'/);
  assert.match(appSource, /flushPointerMove\(\);\s*sendMouse\('mouseReleased'/);
  assert.match(appSource, /flushPointerMove\(\);\s*sendMouse\('mouseWheel'/);
});

test('workspace exposes multi-tab notepad panes with line numbers and text-file save support', () => {
  assert.match(appSource, /data-action="notepad"[^>]+aria-label="New notepad pane"/);
  assert.match(appSource, /function renderNotepadPane\(pane\)/);
  assert.match(appSource, /function renderNotepadTabs\(pane\)/);
  assert.match(appSource, /class="notepad-tab-strip" data-notepad-tab-strip/);
  assert.match(appSource, /function editNotepadTabPath\(paneId, tabId\)/);
  assert.match(appSource, /editNotepadTabPath\(paneId, tabElement\.dataset\.notepadTab\)/);
  assert.match(appSource, /event\.target\.closest\('\.pane-close, button, input, \[data-browser-tab\], \[data-notepad-tab\], \[data-pane-tab\]'\)/);
  assert.match(appSource, /class="notepad-gutter"/);
  assert.match(appSource, /class="notepad-editor"/);
  assert.match(appSource, /plainCtrl && !event\.shiftKey && key === 's'/);
  assert.match(appSource, /openNotepadForFile/);
  assert.match(appSource, /function addNotepadTab\(paneId, filePath = ''\)/);
  assert.match(appSource, /function closeNotepadTabClient\(paneId, tabId\)/);
  assert.match(mainSource, /app\.post\('\/api\/panes\/:paneId\/notepad\/tabs'/);
  assert.match(mainSource, /app\.get\('\/api\/files\/text'/);
  assert.match(mainSource, /app\.put\('\/api\/files\/text'/);
});

test('files and PowerShell panes share a multi-tab strip like the browser pane', () => {
  assert.match(appSource, /class="pane-tab-strip" data-pane-tab-strip data-pane-title="\$\{pane\.id\}"/);
  assert.match(appSource, /function renderPaneTabs\(pane\)/);
  assert.match(appSource, /class="pane-tab-list" role="tablist"/);
  assert.match(appSource, /data-pane-tab="\$\{tab\.id\}"/);
  assert.match(appSource, /data-pane-close-tab="\$\{tab\.id\}"/);
  assert.match(appSource, /data-pane-new-tab/);
  // Every terminal tab keeps its own surface so switching tabs never rebuilds xterm.
  assert.match(appSource, /function renderTerminalSurfaces\(pane\)/);
  assert.match(appSource, /function mountTerminal\(paneId, terminalTabId\)/);
  assert.match(appSource, /paneId=\$\{encodeURIComponent\(terminalTabId\)\}/);
  assert.match(appSource, /function showActiveTerminalTab\(paneId\)/);
  assert.match(appSource, /function activatePaneTabClient\(paneId, tabId\)/);
  assert.match(appSource, /function addPaneTab\(paneId\)/);
  assert.match(appSource, /function closePaneTabClient\(paneId, tabId\)/);
  assert.match(appSource, /function renamePaneTab\(paneId, tabId\)/);
  assert.match(styles, /\.pane-tab-strip\s*\{[^}]*height:\s*var\(--pane-toolbar-height\)/s);
  assert.match(styles, /\.terminal\[hidden\]\s*\{[^}]*display:\s*none/s);
  assert.match(mainSource, /app\.post\('\/api\/panes\/:paneId\/terminal\/tabs'/);
  assert.match(mainSource, /app\.delete\('\/api\/panes\/:paneId\/terminal\/tabs\/:tabId'/);
  assert.match(mainSource, /app\.post\('\/api\/panes\/:paneId\/files\/tabs'/);
  assert.match(mainSource, /app\.delete\('\/api\/panes\/:paneId\/files\/tabs\/:tabId'/);
});

test('a pane tab can be dragged to reorder it, or dropped on another pane of the same kind to move it there', () => {
  assert.match(appSource, /function startPaneTabDrag\(event, tabSelector, onDrop\)/);
  const drag = appSource.slice(appSource.indexOf('function startPaneTabDrag'), appSource.indexOf('function narrowViewport'));
  // Reuses the exact reorder physics as the workspace strip: live offset,
  // FLIP-slide displaced tabs, and a fixed-rate edge scroll.
  assert.match(drag, /list\.insertBefore\(tab, before \|\| null\)/);
  assert.match(drag, /startX \+= tab\.offsetLeft - settled/);
  assert.match(drag, /scrolling = requestAnimationFrame\(edgeScroll\)/);
  // A drop only counts as landing on another pane when the pointer sits over
  // a pane of the exact same kind; anything else keeps reordering in place.
  assert.match(drag, /document\.elementFromPoint\(x, y\)\?\.closest\('\[data-pane\]'\)/);
  assert.match(drag, /hovered\.dataset\.paneType !== originPane\.dataset\.paneType/);
  assert.match(drag, /pane-tab-drop-target/);
  // The click that follows a completed drag must not also activate the tab.
  assert.match(drag, /state\.suppressPaneTabClickUntil = Date\.now\(\) \+ 300/);
  assert.match(appSource, /Date\.now\(\) < state\.suppressPaneTabClickUntil/);
  assert.match(styles, /\.pane-tab-drop-target\s*\{/);
  assert.match(styles, /\.pane-tab\.dragging\s*\{[^}]*transition:\s*none/s);
  assert.match(styles, /\.browser-tab\.dragging,\s*\.notepad-tab\.dragging\s*\{/);

  // Terminal, files, and AI tabs move over the shared REST tab-kind route.
  assert.match(appSource, /startPaneTabDrag\(event, '\.pane-tab', \(index, targetPaneId\) => movePaneTabClient/);
  assert.match(appSource, /async function movePaneTabClient\(paneId, tabId, index, targetPaneId\)/);
  assert.match(appSource, /\/api\/panes\/\$\{paneId\}\/\$\{paneTabKind\(found\.pane\)\}\/tabs\/\$\{tabId\}\/move/);
  assert.match(mainSource, /app\.post\(`\/api\/panes\/:paneId\/\$\{kind\}\/tabs\/:tabId\/move`/);
  assert.match(mainSource, /moveTabRoute\('terminal', 'Terminal', \(tabId, targetPaneId\) => terminalManager\.moveTerminal/);
  assert.match(mainSource, /moveTabRoute\('files', 'Files'\)/);
  assert.match(mainSource, /moveTabRoute\('ai', 'AI'\)/);
  assert.match(mainSource, /moveTabRoute\('notepad', 'Notepad'\)/);

  // Notepad tabs move over their own REST route the same way.
  assert.match(appSource, /startPaneTabDrag\(event, '\.notepad-tab', \(index, targetPaneId\) => moveNotepadTabClient/);
  assert.match(appSource, /\/api\/panes\/\$\{paneId\}\/notepad\/tabs\/\$\{tabId\}\/move/);

  // Browser tabs move over their websocket, like every other browser tab mutation.
  assert.match(appSource, /startPaneTabDrag\(event, '\.browser-tab', \(index, targetPaneId\) => \{\s*state\.browserConnections\.get\(paneId\)\?\.send\(\{ type: 'moveTab'/);
  assert.match(browserSource, /if \(message\.type === 'moveTab'\) \{\s*await this\.moveTab\(paneId, message\.tabId, message\.index, message\.targetPaneId\);/);
});

test('the store can reorder a pane\'s tabs or hand one to another pane of the same kind', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'state.js'), 'utf8');
  assert.match(source, /moveTab\(kind, paneId, tabId, index, targetPaneId\)/);
  // A pane can never be left holding zero tabs.
  assert.match(source, /if \(fromTabs\.length <= 1\) \{\s*return null;/);
  // The pane being dropped on has to be the same kind as the one dragged from.
  assert.match(source, /\(to\.pane\.type \|\| 'terminal'\) !== kind/);
});

test('AI pane tabs can be renamed with the shared inline tab editor', () => {
  const renameSource = appSource.slice(appSource.indexOf('function renamePaneTab'), appSource.indexOf('function wirePaneTabs'));
  assert.match(renameSource, /const tabKind = paneTabKind\(found\.pane\)/);
  assert.match(renameSource, /paneTabs\(found\.pane\)\.find/);
  assert.match(renameSource, /`\/api\/panes\/\$\{paneId\}\/\$\{tabKind\}\/tabs\/\$\{tabId\}`/);
  assert.match(renameSource, /tab\.titlePinned = true/);
});

test('adding panes updates the workspace incrementally without rebuilding existing terminals', () => {
  const openFilesSource = appSource.slice(appSource.indexOf('async function openFilesPane'), appSource.indexOf('async function openUsagePane'));
  const createPaneSource = appSource.slice(appSource.indexOf('async function createPane'), appSource.indexOf('function startPaneResize'));
  assert.match(openFilesSource, /appendPaneToWorkspace/);
  assert.match(createPaneSource, /appendPaneToWorkspace/);
  assert.doesNotMatch(openFilesSource, /loadState\(\)|render\(\)/);
  assert.doesNotMatch(createPaneSource, /loadState\(\)|render\(\)/);
  assert.match(appSource, /function applyPaneLayoutUpdates\(tab, paneLayouts\)/);
  assert.match(mainSource, /paneLayouts:\s*found\.tab\.panes\.map/);
});

test('sidebar, theme, and same-session pane activation avoid full workspace renders', () => {
  assert.match(appSource, /function setSidebarOpen\(open\)/);
  assert.match(appSource, /function setThemeLive\(theme, persist = false\)/);
  assert.match(appSource, /found\.session\.id === state\.activeSessionId/);
  const paneControlsSource = appSource.slice(appSource.indexOf('function wirePaneControls'), appSource.indexOf('function startPaneSwipe'));
  assert.match(paneControlsSource, /pane\.onclick = \(event\) => \{[\s\S]*?setActivePane\(pane\.dataset\.pane,/);
  assert.doesNotMatch(paneControlsSource, /scheduleClick\(/);
});

test('workspace motion is responsive, consistent, and reduced-motion safe', () => {
  for (const token of ['--ease-out', '--dur-fast', '--dur-base', '--dur-cursor']) {
    assert.match(styles, new RegExp(`${token}:`));
  }
  assert.match(styles, /@media \(prefers-reduced-motion: no-preference\)[\s\S]*?\.pane\s*\{[^}]*transition:\s*box-shadow var\(--dur-fast\) var\(--ease-out\)/);
  assert.doesNotMatch(styles, /\.pane\s*\{[^}]*transition:[^;}]*border-color/s);
  assert.match(styles, /@media \(prefers-reduced-motion: no-preference\)[\s\S]*?\.primary:active[\s\S]*?transform:\s*scale\(\.97\)/);
  assert.match(styles, /\.settings-panel\s*\{[^}]*transform-origin:\s*center/s);
  assert.match(styles, /@keyframes settings-panel-in/);
  assert.match(styles, /:root\.theme-changing[\s\S]*?transition:\s*none !important/);
  assert.match(appSource, /function applyTheme[\s\S]*?classList\.add\('theme-changing'\)[\s\S]*?requestAnimationFrame/);
  assert.match(styles, /button:focus-visible,[\s\S]*?outline:\s*2px solid var\(--accent\)/);
});

test('the AI typing cursor blink uses a duration token and honours reduced motion', () => {
  assert.match(styles, /\.ai-bubble\.typing::after\s*\{[^}]*vertical-align:\s*text-bottom;\s*\}/);
  assert.match(styles, /@media \(prefers-reduced-motion: no-preference\)\s*\{\s*\.ai-bubble\.typing::after\s*\{[^}]*animation:\s*ai-cursor-blink var\(--dur-cursor\) step-end infinite/);
});

test('mobile workspace keeps only the brand icon and closes the sidebar after an action', () => {
  const mobileActions = appSource.match(/<div class="mobile-actions">([\s\S]*?)<\/div>/)?.[1] || '';
  assert.match(mobileActions, /class="mobile-brand"[^>]*>[\s\S]*?<span class="rail-brand-mark"[^>]*>W7<\/span><\/button>/);
  assert.doesNotMatch(mobileActions, /WPS7|data-action="files"|data-action="settings"/);
  assert.match(appSource, /function closeMobileSidebarAfterAction\(event\)/);
  assert.match(appSource, /app\.querySelector\('\.sidebar'\)\.addEventListener\('click', closeMobileSidebarAfterAction\)/);
});

test('the layout panel is fully removed from script and styles', () => {
  assert.doesNotMatch(appSource, /layoutPanelOpen|renderLayoutPanel|toggleLayoutPanel|renderMiniPanes|adjustActivePaneLayout|data-action="layout"|data-layout-/);
  assert.doesNotMatch(styles, /\.layout-panel|\.layout-header|\.layout-controls|\.layout-list|\.mini-grid|\.mini-pane|\.mode-switch|\.mobile-sheet/);
});

test('mobile layout collapses the board to one cell so the active pane fills it', () => {
  // One cell wide and one row tall, with the dashed rules off: a grid of one.
  assert.match(styles, /\.app\.mode-mobile \.pane-grid,\s*\.app\.mobile-device \.pane-grid\s*\{[^}]*grid-auto-columns:\s*100%/s);
  assert.match(styles, /\.app\.mode-mobile \.pane-grid,\s*\.app\.mobile-device \.pane-grid\s*\{[^}]*overflow-x:\s*hidden/s);
  assert.match(styles, /\.app\.mode-mobile \.pane-grid,\s*\.app\.mobile-device \.pane-grid\s*\{[^}]*background-image:\s*none/s);
  // the pane's own span must not survive the collapse
  assert.match(styles, /\.app\.mode-mobile \.pane-grid \.pane\.active[\s\S]*?grid-column:\s*1 \/ -1 !important/s);
});

test('activating a pane scrolls it into view, honouring reduced motion', () => {
  const source = appSource.slice(appSource.indexOf('function ensureActivePaneVisible'), appSource.indexOf('function boardStyle'));
  assert.match(source, /if \(isMobileLayout\(\)\) \{\s*return;/);
  assert.match(source, /matchMedia\?\.\('\(prefers-reduced-motion: reduce\)'\)\.matches/);
  assert.match(source, /behavior: reduceMotion \? 'auto' : behavior/);
  assert.match(source, /inline: 'nearest'/);
  assert.match(appSource, /sidebarPaneRowActive\(found\.pane, button\.dataset\.sidebarPaneTab\)\);\s*\}\);\s*ensureActivePaneVisible\(\);/);
  assert.match(appSource, /window\.addEventListener\('resize', updateVisualViewport\)/);
});

test('modal dialogs are labelled, escapable, and restore focus to the opener', () => {
  assert.match(appSource, /function wireModal\(panel, requestClose, labelledBy\)/);
  const modalSource = appSource.slice(appSource.indexOf('function wireModal'), appSource.indexOf('function discardOverlay'));
  assert.match(modalSource, /panel\.setAttribute\('role', 'dialog'\)/);
  assert.match(modalSource, /panel\.setAttribute\('aria-modal', 'true'\)/);
  assert.match(modalSource, /event\.key === 'Escape'/);
  assert.match(modalSource, /event\.key !== 'Tab'/);
  assert.match(modalSource, /if \(opener\?\.isConnected\) \{\s*opener\.focus\(\);/);
  assert.match(appSource, /wireModal\(overlay\.querySelector\('\.settings-panel'\), \(\) => closeSettings\(\), 'settings-dialog-title'\)/);
  assert.match(appSource, /id="settings-dialog-title"/);
});

test('display mode and terminal density live in settings with preview semantics', () => {
  assert.match(appSource, /function setTerminalDensity\(density, persist = true\)/);
  assert.match(appSource, /data-display-mode="\$\{mode\}" aria-pressed=/);
  assert.match(appSource, /data-terminal-density="\$\{density\}" aria-pressed=/);
  assert.match(appSource, /setDisplayMode\(button\.dataset\.displayMode, false\)/);
  assert.match(appSource, /setTerminalDensity\(button\.dataset\.terminalDensity, false\)/);
  assert.match(appSource, /setDisplayMode\(savedDisplayMode, false\)/);
  assert.match(appSource, /setTerminalDensity\(savedTerminalDensity, false\)/);
  assert.match(appSource, /localStorage\.setItem\('wps7\.displayMode', state\.displayMode\)/);
  assert.match(styles, /\.segmented-option\.active\s*\{[^}]*border-color:\s*var\(--accent\)[^}]*background:\s*var\(--accent-soft\)/s);
});

test('settings explain preview semantics and state password rules outside the placeholder', () => {
  assert.match(appSource, /Previewed live — Cancel reverts, Save keeps it\./);
  assert.match(appSource, /class="live-badge">● Live preview</);
  assert.doesNotMatch(appSource, /placeholder="12\+ chars/);
  assert.match(appSource, /aria-describedby="settings-password-rule"/);
  assert.match(appSource, /class="field-hint" id="settings-password-rule">At least 12 characters/);
});

test('settings checkboxes are not styled as text inputs', () => {
  assert.match(styles, /\.settings-check\s*\{[^}]*border:\s*0[^}]*background:\s*transparent/s);
});

test('login offers browser persistence without persisting ordinary sessions', () => {
  assert.match(appSource, /name="remember" type="checkbox"/);
  assert.match(appSource, /Keep me signed in for 30 days/);
  assert.match(appSource, /localStorage\.getItem\('wps7\.token'\) \|\| sessionStorage\.getItem\('wps7\.token'\)/);
  assert.match(appSource, /function saveToken\(token, remember\)/);
  assert.match(appSource, /remember: form\.get\('remember'\) === 'on'/);
  assert.match(appSource, /function clearToken\(\)/);
});

test('changing the server password revokes remembered and connected sessions', () => {
  assert.match(mainSource, /function revokeWebSocketSessions\(\)/);
  assert.match(mainSource, /passwordChanged[\s\S]*?revokeWebSocketSessions\(\)/);
  assert.match(mainSource, /client\.close\(1008, 'Login required'\)/);
  assert.match(appSource, /if \(payload\.auth\?\.password\)[\s\S]*?clearToken\(\)[\s\S]*?renderLogin\(\)/);
});

test('sidebar expanded state and width are restored from local storage', () => {
  assert.match(appSource, /localStorage\.getItem\('wps7\.sidebarOpen'\)/);
  assert.match(appSource, /localStorage\.setItem\('wps7\.sidebarOpen', String\(state\.sidebarOpen\)\)/);
  assert.match(appSource, /localStorage\.getItem\('wps7\.sidebarWidth'\)/);
  assert.match(appSource, /localStorage\.setItem\('wps7\.sidebarWidth', String\(width\)\)/);
});

test('sidebar can be pinned or used as a dismissible floating panel', () => {
  assert.match(appSource, /localStorage\.getItem\('wps7\.sidebarPinned'\)/);
  const sidebarBrand = appSource.match(/<div class="sidebar-brand-row">([\s\S]*?)<\/div>/)?.[1] || '';
  assert.match(sidebarBrand, /data-action="toggle"/);
  assert.match(sidebarBrand, /data-sidebar-pin[^>]+aria-pressed="\$\{state\.sidebarPinned\}"/);
  assert.doesNotMatch(sidebarBrand, /rail-label[^>]*>\$\{state\.sidebarPinned \? 'Unpin sidebar' : 'Pin sidebar'\}/);
  assert.match(appSource, /['"]pin-off['"]:/);
  assert.match(appSource, /function setSidebarPinned\(pinned\)/);
  assert.match(appSource, /function closeFloatingSidebarFromOutside\(event\)/);
  assert.match(styles, /\.app:not\(\.sidebar-pinned\):not\(\.sidebar-closed\) \.sidebar\s*\{[^}]*position:\s*fixed/s);
  assert.match(styles, /\.sidebar-brand-row\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\) auto/s);
});

test('a long workspace/pane name truncates instead of pushing the pin control off screen', () => {
  // An implicit auto column would size the sidebar grid to its longest row.
  assert.match(styles, /\.sidebar\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\)/s);
  assert.match(styles, /\.session-item span\s*\{[^}]*min-width:\s*0[^}]*overflow:\s*hidden[^}]*text-overflow:\s*ellipsis[^}]*white-space:\s*nowrap/s);
});

test('sidebar pane rows display the matching pane icon before their workspace and pane names', () => {
  const sidebarItemSource = appSource.slice(appSource.indexOf('function renderSidebarPaneItem'), appSource.indexOf('function renderSidebarPaneList'));
  assert.match(sidebarItemSource, /fileActionIcon\(sidebarPaneIcon\(pane\)\)/);
  assert.match(appSource, /function sidebarPaneIcon\(pane\)/);
  assert.match(styles, /\.session-item \.file-action-icon\s*\{[^}]*flex:\s*0 0 15px[^}]*margin-right:\s*8px/s);
});

test('sidebar creates a persistent usage pane with configurable providers', () => {
  assert.match(mainSource, /app\.get\('\/api\/usage', requireAuth\(config\)/);
  assert.match(mainSource, /app\.post\('\/api\/panes\/:paneId\/usage'/);
  assert.match(appSource, /data-action="usage"[^>]+aria-label="New usage pane"/);
  assert.match(appSource, /async function openUsagePane\(\)/);
  assert.match(appSource, /function renderUsagePane\(pane\)/);
  assert.match(appSource, /api\('\/api\/usage\?refresh=1'\)/);
  assert.match(appSource, /Codex/);
  assert.match(appSource, /Claude Code/);
  assert.match(appSource, /MiniMax/);
  assert.match(appSource, /name="usage\.show_codex"/);
  assert.match(appSource, /name="usage\.show_claude"/);
  assert.match(appSource, /name="usage\.show_minimax"/);
  assert.match(appSource, /name="usage\.minimax_api_key"/);
  assert.match(appSource, /name="usage\.minimax_region"/);
  assert.match(styles, /\.usage-pane\s*\{/);
  assert.doesNotMatch(appSource, /className = 'usage-overlay'/);
});

// Providers rate limit per account, so only the button may spend a lookup: the
// timer goes through the shared server cache, and a limited provider keeps
// showing its last reading instead of blanking the card.
test('usage auto-refresh reuses the server cache and surfaces a stale reading', () => {
  assert.match(appSource, /async function loadUsagePane\(paneId, refresh = false, force = refresh\)/);
  assert.match(appSource, /const result = force \? await api\('\/api\/usage\?refresh=1'\) : await api\('\/api\/usage'\)/);
  assert.match(appSource, /const detail = provider\.stale \|\|/);
  assert.match(appSource, /class="usage-state\$\{provider\.stale \? '' : ' ok'\}"/);
  assert.match(mainSource, /usage\.keepLastGoodUsage\(overview\.providers \|\| \[\], lastGoodUsage\)/);
});

test('usage settings configure the MiniMax key and the visible quota windows', () => {
  assert.match(appSource, /name="usage\.minimax_api_key"/);
  assert.match(appSource, /name="usage\.clear_minimax_api_key"/);
  for (const key of ['show_five_hour', 'show_weekly', 'show_model_weekly', 'show_credits']) {
    assert.match(appSource, new RegExp(`name="usage\\.${key}"`));
    assert.match(appSource, new RegExp(`${key}: form\\.get\\('usage\\.${key}'\\) === 'on'`));
  }
  assert.match(mainSource, /fetchCodexUsage\(\{ codexHome: config\.usage\.codex_home \|\| undefined, log: usageLog \}\)/);
  assert.match(mainSource, /fetchClaudeUsage\(\{ claudeHome: config\.usage\.claude_home \|\| undefined, log: usageLog \}\)/);
});

test('usage settings allow pinning the Codex/Claude Code CLI home folder', () => {
  assert.match(appSource, /name="usage\.codex_home"/);
  assert.match(appSource, /name="usage\.claude_home"/);
  assert.match(appSource, /codex_home: String\(form\.get\('usage\.codex_home'\) \|\| ''\)\.trim\(\)/);
  assert.match(appSource, /claude_home: String\(form\.get\('usage\.claude_home'\) \|\| ''\)\.trim\(\)/);
});

// Codex and Claude Code usage come from the signed-in CLI accounts; an API key cannot
// read subscription quotas, and storing one used to disable the working OAuth path.
test('usage settings expose no Codex or Claude Code API key fields', () => {
  for (const name of ['codex_api_key', 'claude_api_key', 'clear_codex_api_key', 'clear_claude_api_key']) {
    assert.doesNotMatch(appSource, new RegExp(`usage\\.${name}`));
  }
  assert.doesNotMatch(mainSource, /codex_api_key|claude_api_key/);
});

test('file pane shows modified timestamps in 24-hour time', () => {
  assert.match(appSource, /function formatModified\(value\)[\s\S]*?hour12: false/);
});

test('usage pane shows quota reset times in 24-hour time', () => {
  assert.match(appSource, /function usageWindowMarkup\(window\)[\s\S]*?hour12: false/);
});

test('usage windows count down to the reset instead of printing a timestamp', () => {
  const countdown = appSource.slice(appSource.indexOf('function usageCountdown'), appSource.indexOf('function usageLevel'));
  assert.match(countdown, /return 'Reset time unavailable'/);
  assert.match(countdown, /minutes < 0[\s\S]*?return 'Resetting now'/);
  assert.match(countdown, /minutes < 1[\s\S]*?return 'Resets in under a minute'/);
  assert.match(countdown, /const days = Math\.floor\(minutes \/ 1440\)/);
  // The timestamp stays reachable as the title rather than being thrown away.
  assert.match(appSource, /data-usage-countdown="\$\{escapeAttr\(window\.resetsAt \|\| ''\)\}" title="\$\{escapeAttr\(absolute\)\}"/);
  // Readings only change on refresh; the time left changes on its own.
  assert.match(appSource, /function startUsageCountdownTicker\(\)/);
  assert.match(appSource, /label\.textContent = usageCountdown\(label\.dataset\.usageCountdown\)/);
  assert.match(appSource, /if \(!labels\.length\)[\s\S]*?clearInterval\(usageCountdownTimer\)/);
});

test('the Codex usage card shows banked reset credits and their local expiry time, not usage', () => {
  const markup = appSource.slice(appSource.indexOf('function usageProviderMarkup'), appSource.indexOf('function renderUsagePane'));
  assert.match(markup, /provider\.resetCredits\?\.count > 0/);
  assert.match(markup, /<span>Reset credits<\/span><strong>\$\{provider\.resetCredits\.count\}/);
  assert.match(markup, /provider\.resetCredits\?\.expiresAt/);
  assert.match(markup, /toLocaleString\(\[\], \{ dateStyle: 'medium', timeStyle: 'short', hour12: false \}\)/);
  assert.doesNotMatch(markup, /resetCredits[\s\S]*?consume|redeem/i);
});

test('a quota window turns amber then red at the configured thresholds', () => {
  const level = appSource.slice(appSource.indexOf('function usageLevel'), appSource.indexOf('function usageWindowMarkup'));
  assert.match(level, /usedPercent >= alert[\s\S]*?return 'danger'/);
  assert.match(level, /usedPercent >= warn[\s\S]*?return 'warn'/);
  assert.match(appSource, /<div class="usage-window \$\{level\}">/);
  assert.match(styles, /\.usage-window\.warn \.usage-meter i\s*\{\s*background:\s*var\(--warn\)/s);
  assert.match(styles, /\.usage-window\.danger \.usage-meter i\s*\{\s*background:\s*var\(--danger\)/s);
  // Amber above red would read as a lower level than red, so it is pinned below.
  assert.match(mainSource, /function usageThresholds\(config\)[\s\S]*?warn_percent: Math\.min\(usagePercent\(config\.usage\.warn_percent, 75\), alert\)/);
  assert.match(appSource, /name="usage\.warn_percent"/);
  assert.match(appSource, /name="usage\.alert_percent"/);
});

test('crossing the red threshold notifies once per crossing, not once per refresh', () => {
  const notify = appSource.slice(appSource.indexOf('function notifyUsageThresholds'), appSource.indexOf('function clearUsageRefresh'));
  assert.match(notify, /!state\.config\?\.usage\?\.notify_quota/);
  assert.match(notify, /Notification\.permission !== 'granted'/);
  // Keyed on provider and window only: the providers return a reset timestamp
  // that drifts by a second between calls, so it cannot identify a period.
  assert.match(notify, /const key = `\$\{provider\.provider\}:\$\{window\.label\}`/);
  assert.match(notify, /const previous = usageWindowLevels\.get\(key\)/);
  assert.match(notify, /used < alert \|\| \(previous !== undefined && previous >= alert\)/);
  assert.match(appSource, /notifyUsageThresholds\(providers\);\s*startUsageCountdownTicker\(\);/);
  assert.match(appSource, /name="usage\.notify_quota"/);
  // A disabled checkbox is absent from the form data and would clear the setting.
  assert.match(appSource, /notify_quota: quotaNotifyInput\?\.disabled\s*\? Boolean\(state\.config\.usage\?\.notify_quota\)/);
  assert.match(appSource, /for \(const name of \['terminal\.browser_notifications', 'usage\.notify_quota'\]\)/);
  assert.match(mainSource, /typeof updates\.usage\.notify_quota === 'boolean'/);
});

test('usage pane puts the refresh button beside the pane close button instead of a toolbar row', () => {
  assert.match(appSource, /class="pane-usage-refresh"[^>]*data-usage-refresh/);
  assert.match(styles, /\.pane-usage-refresh\s*\{[^}]*right:\s*32px/s);
  // The toolbar row and its "AI provider quota windows" caption are gone.
  assert.doesNotMatch(appSource, /usage-pane-toolbar|AI provider quota windows/);
  assert.doesNotMatch(styles, /usage-pane-toolbar/);
});

test('usage panes auto-refresh on the configured interval and stop when set to zero', () => {
  assert.match(appSource, /name="usage\.refresh_minutes"[^>]*type="number"[^>]*min="0"[^>]*max="999"/);
  assert.match(appSource, /refresh_minutes: numberOrUndefined\(form\.get\('usage\.refresh_minutes'\)\)/);
  // 0 (and any non-positive value) must leave no timer scheduled.
  assert.match(appSource, /function scheduleUsageRefresh\(paneId\)[\s\S]*?if \(!Number\.isFinite\(minutes\) \|\| minutes <= 0\) return;/);
  assert.match(appSource, /setTimeout\(\(\) => loadUsagePane\(paneId, true, false\), minutes \* 60000\)/);
  // Closing a pane must not leave its timer running. Other pane types clean up
  // between these two lines, so only the order matters here.
  assert.match(appSource, /clearUsageRefresh\(paneId\);[\s\S]{0,400}?const index = found\.tab\.panes\.findIndex/);
  assert.match(mainSource, /function usageRefreshMinutes\(config\)[\s\S]*?minutes >= 0 && minutes <= 999 \? minutes : 10/);
});

test('usage cards reflow to fit the pane width and refreshing keeps the current cards visible', () => {
  assert.match(styles, /\.usage-content\s*\{[^}]*grid-template-columns:\s*repeat\(auto-fit, minmax\(240px, 1fr\)\)/s);
  const loadUsagePaneSource = appSource.slice(appSource.indexOf('async function loadUsagePane'), appSource.indexOf('const mobileKeybarModifierOptions'));
  assert.match(loadUsagePaneSource, /if \(!refresh\) \{\s*content\.innerHTML = '<div class="usage-loading">Reading provider usage…<\/div>';\s*\}/);
});

test('mobile terminal sends touch movement through the xterm scroll surface with a compact virtual key row', () => {
  assert.match(appSource, /function installMobileTerminalTouchScroll\(element, term, openContextMenu\)/);
  assert.match(appSource, /new WheelEvent\('wheel'/);
  // Dragging down pulls older output back into view, so the text follows the
  // finger instead of running away from it.
  assert.match(appSource, /const deltaY = nextY - lastY/);
  assert.doesNotMatch(appSource, /term\.scrollLines\(-lines\)/);
  assert.match(styles, /\.app\.mode-mobile \.terminal[\s\S]*?touch-action:\s*none/s);
  assert.match(appSource, /class="mobile-keybar"/);
  assert.match(appSource, /function renderMobileKeybar\(\)/);
  assert.match(appSource, /mobile_keybar_buttons/);
  assert.match(appSource, /function sendMobileTerminalKey\(button\)/);
});

test('mobile terminal long press selects a word without breaking touch scrolling', () => {
  assert.match(appSource, /installMobileTerminalTouchScroll\(element, term, \(clientX, clientY\) => \{/);
  assert.match(appSource, /const longPressDelay = 500/);
  assert.match(appSource, /function terminalCellAtTouch\(element, term, touch\)/);
  assert.match(appSource, /function selectTerminalWordAtTouch\(element, term, touch\)/);
  assert.match(appSource, /term\.select\(/);
  assert.match(appSource, /classList\.add\('touch-selecting'\)/);
  assert.match(styles, /\.terminal\.touch-selecting/);
});

test('the terminal menu waits for the finger to lift so a selection can still be dragged open', () => {
  // The browser fires contextmenu partway through the long press, while the
  // selection is still being dragged; that one is dropped.
  assert.match(appSource, /if \(touchScroll\.isTouchActive\(\)\) \{\s*return;\s*\}/);
  assert.match(appSource, /return \{ isTouchActive: \(\) => touchActive \};/);
  const touchEnd = appSource.slice(appSource.indexOf("element.addEventListener('touchend'"), appSource.indexOf("element.addEventListener('touchcancel'"));
  assert.match(touchEnd, /openContextMenu\?\.\(touch\.clientX, touch\.clientY\)/);
});

test('a keybar modifier keeps terminal focus and modifies the next software-keyboard character', () => {
  assert.match(appSource, /button\.onpointerdown = \(event\) => event\.preventDefault\(\)/);
  assert.match(appSource, /function applyMobileModifiers\(element, data\)/);
  assert.match(appSource, /String\.fromCharCode\(code & 31\)/);
  assert.match(appSource, /applyMobileModifiers\(element, data\)/);
  assert.match(appSource, /terminal\.term\.focus\(\)/);
  assert.match(appSource, /function terminalShortcutSequence\(shortcut\)/);
  assert.match(appSource, /data-terminal-action/);
});

test('Alt and Shift are keybar modifiers of their own, not just Ctrl', () => {
  // applyMobileModifiers reads every pressed modifier, so a typed character can
  // pick up Alt or Shift the same way it already picked up Ctrl.
  const applyModifiers = appSource.slice(
    appSource.indexOf('  function applyMobileModifiers(element, data) {'),
    appSource.indexOf('  function closeFloatingSidebarFromOutside(event) {')
  );
  assert.match(applyModifiers, /active\.has\('Shift'\)/);
  assert.match(applyModifiers, /active\.has\('Control'\)/);
  assert.match(applyModifiers, /active\.has\('Alt'\)/);
  // xterm reports focus and paste through onData too; those must not spend a
  // modifier that was armed for the keystroke still to come.
  assert.match(applyModifiers, /if \(!keybar \|\| data\.length !== 1\) \{\s*return data;/);
  const defaults = appSource.slice(
    appSource.indexOf('const defaultMobileKeybarButtons = ['),
    appSource.indexOf("const savedSidebarOpen =")
  );
  assert.match(defaults, /label: 'Alt', action: 'modifier', value: 'Alt'/);
  assert.match(defaults, /label: 'Shift', action: 'modifier', value: 'Shift'/);
  assert.match(configSource, /label: 'Alt', action: 'modifier', value: 'Alt'/);
  assert.match(configSource, /label: 'Shift', action: 'modifier', value: 'Shift'/);
});

test('a keybar modifier arms for one key and locks on a double-click', () => {
  assert.match(appSource, /setKeybarModifierState\(button, button\.dataset\.modifierState \? '' : 'armed'\)/);
  assert.match(appSource, /button\.ondblclick = \(\) => \{\s*setKeybarModifierState\(button, 'locked'\)/);
  // Only an armed modifier is spent by the key that follows it.
  const consume = appSource.slice(
    appSource.indexOf('  function consumeKeybarModifiers(keybar) {'),
    appSource.indexOf('  // Keys whose escape sequence ends in a letter')
  );
  assert.match(consume, /if \(button\.dataset\.modifierState === 'armed'\) \{\s*setKeybarModifierState\(button, ''\);/);
  assert.match(styles, /\.mobile-keybar button\[data-modifier-state="locked"\]/);
});

// The sequence helpers are pure string maths, so they run for real rather than
// being matched as source text. isKeyToken leans on the settings editor's key
// vocabulary, so that block is loaded alongside them.
function loadTerminalSequenceHelpers() {
  const slice = (from, to) => {
    const start = appSource.indexOf(from);
    const end = appSource.indexOf(to);
    assert.ok(start >= 0 && end > start, `not found in app.js: ${from}`);
    return appSource.slice(start, end);
  };
  const context = vm.createContext({});
  vm.runInContext([
    slice('  const namedShortcutKeys = new Set([', '  function mobileKeybarRowValidity(action, value) {'),
    slice('  // Keys whose escape sequence ends in a letter', '  function applyMobileModifiers(element, data) {')
  ].join('\n'), context);
  return context;
}

test('terminalShortcutSequence covers the keys the settings editor accepts', () => {
  const { terminalShortcutSequence } = loadTerminalSequenceHelpers();
  assert.equal(terminalShortcutSequence('Escape'), '\x1b');
  assert.equal(terminalShortcutSequence('Enter'), '\r');
  assert.equal(terminalShortcutSequence('Ctrl+C'), '\x03');
  assert.equal(terminalShortcutSequence('ArrowUp'), '\x1b[A');
  assert.equal(terminalShortcutSequence('Ctrl+ArrowLeft'), '\x1b[1;5D');
  assert.equal(terminalShortcutSequence('Home'), '\x1b[H');
  assert.equal(terminalShortcutSequence('End'), '\x1b[F');
  assert.equal(terminalShortcutSequence('Delete'), '\x1b[3~');
  assert.equal(terminalShortcutSequence('PageUp'), '\x1b[5~');
  assert.equal(terminalShortcutSequence('Ctrl+PageDown'), '\x1b[6;5~');
  assert.equal(terminalShortcutSequence('F5'), '\x1b[15~');
  assert.equal(terminalShortcutSequence('F12'), '\x1b[24~');
  assert.equal(terminalShortcutSequence('Alt+f'), '\x1bf');
});

test('Shift+Tab sends back-tab instead of a plain Tab', () => {
  const { terminalShortcutSequence } = loadTerminalSequenceHelpers();
  assert.equal(terminalShortcutSequence('Tab'), '\t');
  assert.equal(terminalShortcutSequence('Shift+Tab'), '\x1b[Z');
});

test('a typed-text button can chain keys so one press runs a command', () => {
  const { terminalTextSequence } = loadTerminalSequenceHelpers();
  assert.equal(terminalTextSequence('claude{Enter}'), 'claude\r');
  assert.equal(terminalTextSequence('npm test{Enter}'), 'npm test\r');
  assert.equal(terminalTextSequence('{Ctrl+C}{Enter}'), '\x03\r');
  assert.equal(terminalTextSequence('git status'), 'git status');
  // A doubled brace types one, so text that really wants to read like a key
  // name still works.
  assert.equal(terminalTextSequence('{{Enter}'), '{Enter}');
});

test('braces that name no key are typed as written, so PowerShell syntax survives', () => {
  const { terminalTextSequence } = loadTerminalSequenceHelpers();
  // A lone character never needs the brace form, and reading it as a key used
  // to eat the braces of a variable reference.
  assert.equal(terminalTextSequence('${x}'), '${x}');
  assert.equal(terminalTextSequence('${env:PATH}'), '${env:PATH}');
  assert.equal(terminalTextSequence('@{a=1}'), '@{a=1}');
  assert.equal(terminalTextSequence('Get-ChildItem | % { $_.Name }'), 'Get-ChildItem | % { $_.Name }');
  assert.equal(terminalTextSequence('echo {}'), 'echo {}');
  assert.equal(terminalTextSequence('if ($x) { echo hi }'), 'if ($x) { echo hi }');
  // Key names still win, including inside a longer command.
  assert.equal(terminalTextSequence('echo ${x}{Enter}'), 'echo ${x}\r');
});

test('a text row holding a brace-heavy command is valid, with a hint rather than an error', () => {
  const validity = appSource.slice(
    appSource.indexOf('  function mobileKeybarRowValidity(action, value) {'),
    appSource.indexOf('  function readMobileKeybarRow(row) {')
  );
  assert.match(validity, /literal\.length\s*\?\s*\{ valid: true/);
  assert.match(validity, /is not a key name, so it is typed as text/);
  // The hint is shown whether or not the row is in error, so a valid row can
  // still explain itself; only an error paints it red.
  assert.match(appSource, /hintEl\.textContent = hint;/);
  assert.match(styles, /\.mobile-keybar-hint\s*\{[^}]*color:\s*var\(--muted\)/s);
  assert.match(styles, /\.mobile-keybar-setting-row\.invalid \.mobile-keybar-hint\s*\{[^}]*color:\s*var\(--danger\)/s);
});

test('mobile keybar can be configured, reordered and extended from server-synced settings', () => {
  assert.match(appSource, /data-mobile-keybar-editor/);
  assert.match(appSource, /data-mobile-keybar-add/);
  assert.match(appSource, /data-mobile-keybar-up/);
  assert.match(appSource, /data-mobile-keybar-down/);
  assert.match(appSource, /action === 'text'/);
  assert.match(appSource, /mobileKeybarButtonsFromSettings/);
  assert.match(mainSource, /sanitizeMobileKeybarButtons/);
  assert.match(appSource, /PowerShell shortcut buttons/);
});

test('terminal keeps its vertical scrollbar and themes the slider', () => {
  // The fit addon reserves the gutter, so only the unused horizontal bar is hidden.
  assert.match(styles, /\.terminal \.xterm-scrollable-element > \.scrollbar\.horizontal\s*\{[^}]*display:\s*none !important/s);
  assert.doesNotMatch(styles, /\.terminal \.xterm-scrollable-element > \.scrollbar\s*\{/);
  assert.match(appSource, /scrollbarSliderBackground: hexToRgba\(palette\.accent/);
  assert.match(appSource, /scrollbarSliderHoverBackground: hexToRgba\(palette\.accent/);
  assert.match(appSource, /scrollbarSliderActiveBackground: hexToRgba\(palette\.accent/);
});

test('keybar editor shows a live preview and validates each row without silently dropping buttons', () => {
  assert.match(appSource, /data-mobile-keybar-preview/);
  assert.match(appSource, /function renderKeybarPreviewChips\(rows\)/);
  assert.match(appSource, /function refreshMobileKeybarPreview\(container\)/);
  assert.match(appSource, /function mobileKeybarRowValidity\(action, value\)/);
  assert.match(appSource, /function isSupportedShortcut\(value\)/);
  assert.match(appSource, /row\.classList\.toggle\('invalid', invalid\)/);
  assert.match(appSource, /function mobileKeybarSkippedCount\(form\)/);
  assert.match(appSource, /skippedKeybarButtons = mobileKeybarSkippedCount\(event\.currentTarget\)/);
  assert.match(appSource, /shortcut button\(s\) skipped/);
  assert.match(styles, /\.mobile-keybar-preview\s*\{/);
  assert.match(styles, /\.mobile-keybar-setting-row\.invalid\s*\{[^}]*border-color:\s*var\(--danger\)/s);
});

test('keybar editor switches input by action and offers a modifier select', () => {
  assert.match(appSource, /const mobileKeybarModifierOptions = \['Control', 'Alt', 'Shift'\]/);
  assert.match(appSource, /data-mobile-keybar-modifier/);
  assert.match(appSource, /function syncMobileKeybarRowAction\(row\)/);
  assert.match(appSource, /action === 'text' \? 'claude\{Enter\}' : 'Ctrl\+C, Escape, Home, F5'/);
  assert.match(appSource, /function modifierShortcutToken\(value\)/);
  assert.match(appSource, /\{ Control: 'Ctrl', Alt: 'Alt', Shift: 'Shift' \}/);
});

test('keybar editor supports recording, duplicating, resetting and drag reordering', () => {
  assert.match(appSource, /data-mobile-keybar-record/);
  assert.match(appSource, /function startMobileKeybarRecording\(recordButton, row, refresh\)/);
  assert.match(appSource, /data-mobile-keybar-duplicate/);
  assert.match(appSource, /renderMobileKeybarRow\(readMobileKeybarRow\(row\)\)/);
  assert.match(appSource, /data-mobile-keybar-reset/);
  assert.match(appSource, /editor\.innerHTML = defaultMobileKeybarButtons\.map\(renderMobileKeybarRow\)\.join\(''\)/);
  assert.match(appSource, /function wireMobileKeybarDrag\(editor, refresh\)/);
  assert.match(appSource, /data-mobile-keybar-drag draggable="true"/);
  assert.match(styles, /\.mobile-keybar-drag\s*\{[^}]*cursor:\s*grab/s);
});

test('mobile PowerShell toolbar stays compact at the bottom without hiding the keyboard', () => {
  // A button sizes itself to its label, so the cap is what keeps a long name
  // from paging the toolbar down to one button: 15 characters fits a name like
  // "Ctrl+Shift+Esc" and still leaves room for two buttons per page on a phone.
  assert.match(appSource, /data-mobile-keybar-label maxlength="15"/);
  assert.match(mainSource, /button\.label\.trim\(\)\.slice\(0, 15\)/);
  assert.match(appSource, /keybar\.querySelectorAll\('button'\)\.forEach\(\(button\) => \{\s*button\.onpointerdown = \(event\) => event\.preventDefault\(\)/s);
  assert.match(styles, /\.app\.mode-mobile \.pane\[data-pane-type="terminal"\],[\s\S]*?grid-template-rows:\s*auto minmax\(0, 1fr\) auto/s);
  assert.match(styles, /\.app\.mode-mobile \.mobile-keybar,[\s\S]*?grid-row:\s*3/s);
  assert.match(styles, /\.app\.mode-mobile \.mobile-keybar \[data-toolbar-item\],[\s\S]*?width:\s*auto[^}]*min-width:\s*44px/s);
  assert.match(styles, /\.app\.mode-mobile \.mobile-keybar \.paged-toolbar-button,[\s\S]*?width:\s*34px[^}]*max-width:\s*34px/s);
  assert.match(styles, /@media \(max-width:\s*760px\)[\s\S]*?\.app\.mode-auto \.mobile-keybar\s*\{[^}]*display:\s*flex/s);
});

test('the floating mobile sidebar keeps its footer inside the visual viewport', () => {
  // `bottom: 0` on a phone resolves against the layout viewport, which spans
  // the collapsible URL bar, so the Settings button in .sidebar-footer fell
  // below the visible area.
  for (const selector of [
    /\.app\.mode-mobile:not\(\.sidebar-closed\) \.sidebar\s*\{[^}]*height:\s*var\(--app-height, 100dvh\)/s,
    /\.app\.mode-auto:not\(\.sidebar-closed\) \.sidebar\s*\{[^}]*height:\s*var\(--app-height, 100dvh\)/s,
    /\.app\.mobile-device:not\(\.sidebar-closed\) \.sidebar\s*\{[^}]*height:\s*var\(--app-height, 100dvh\)/s
  ]) {
    assert.match(styles, selector);
  }
  // The list between the rail and the footer has to absorb the lost height.
  assert.match(styles, /\.sidebar\s*\{[^}]*grid-template-rows:\s*auto minmax\(0, 1fr\) auto/s);
});

test('mobile detection and soft keyboard follow the actual visual viewport', () => {
  assert.match(appSource, /matchMedia\('\(pointer: coarse\)'\)/);
  assert.match(appSource, /navigator\.maxTouchPoints/);
  assert.match(appSource, /window\.visualViewport/);
  assert.match(appSource, /--app-height/);
  assert.match(appSource, /term\.scrollToBottom\(\)/);
});

test('mobile session double tap cancels activation and starts rename', () => {
  assert.match(appSource, /function installSessionTabTouchRename\(button\)/);
  assert.match(appSource, /state\.suppressSessionClickUntil/);
  assert.match(appSource, /now - previous\.at > 420/);
  assert.match(appSource, /renameSession\(button\.dataset\.tabSession, label\.textContent\)/);
  assert.match(styles, /\.tab\s*\{[^}]*touch-action:\s*manipulation/s);
});

test('files pane exposes the complete compact action set', () => {
  for (const action of ['file-up', 'file-refresh', 'file-new-folder', 'file-new-file', 'file-download-selected', 'file-copy-selected', 'file-delete-selected', 'file-select-all', 'file-show-hidden', 'file-upload', 'folder-upload']) {
    assert.match(appSource, new RegExp(`data-${action}`));
  }
  assert.match(styles, /\.file-command-button\s*\{[^}]*height:\s*28px/s);
  assert.match(styles, /\.compact-file-row\s*\{[^}]*min-height:\s*28px/s);
  assert.match(styles, /\.menu-rail \.rail-button\s*\{[^}]*min-height:\s*32px/s);
});

test('files pane supports range, additive, select-all, and middle-click path copy', () => {
  assert.match(appSource, /event\.shiftKey/);
  assert.match(appSource, /event\.(ctrlKey|metaKey)/);
  assert.match(appSource, /selectFileRange/);
  assert.match(appSource, /data-file-select-all/);
  assert.match(appSource, /event\.button !== 1/);
  assert.match(appSource, /navigator\.clipboard\.writeText/);
  assert.match(appSource, /data-file-copy-selected/);
  assert.match(appSource, /document\.execCommand\('copy'\)/);
  assert.match(appSource, /row\.onmousedown[\s\S]*?event\.button === 1[\s\S]*?copyFilePath\(row\.dataset\.fileRow\)/);
  assert.match(styles, /\.compact-file-row\s*\{[^}]*user-select:\s*none/s);
  assert.match(styles, /\.compact-file-row:focus,\s*\.compact-file-row:focus-visible\s*\{[^}]*outline:\s*1px solid var\(--accent\)/s);
});

test('files pane supports drag upload and Windows-style sortable detail columns', () => {
  for (const key of ['name', 'modified', 'size']) {
    assert.match(appSource, new RegExp(`data-file-sort="${key}"`));
  }
  assert.match(appSource, /sortKey:\s*'name'/);
  assert.match(appSource, /sortDirection:\s*'asc'/);
  assert.match(appSource, /function sortedFileEntries\(paneId\)/);
  assert.match(appSource, /addEventListener\('dragover'/);
  assert.match(appSource, /addEventListener\('drop'/);
  assert.match(appSource, /webkitGetAsEntry/);
  assert.match(appSource, /pane-kind-icon[\s\S]*?pane-upload-status[\s\S]*?data-rename-pane/);
  assert.match(appSource, /setFileStatus\('0%', paneId\)/);
  assert.match(appSource, /setFileStatus\(`\$\{percent\}%`, paneId\)/);
  assert.match(appSource, /class="file-drop-overlay"[^>]*>Drop files or folders to upload<\/div>/);
  assert.match(appSource, /querySelector\(`\[data-pane-upload-status="\$\{paneId\}"\]`\)/);
  assert.match(styles, /\.file-column-header\s*\{/);
  assert.match(styles, /\.file-column-header\s*\{[^}]*position:\s*sticky[^}]*top:\s*0[^}]*z-index:\s*2/s);
  assert.match(styles, /\.files-pane \.file-list\s*\{[^}]*padding:\s*0 2px 2px/s);
  assert.match(appSource, /class="file-size">\$\{entry\.type === 'file' \? formatBytes\(entry\.size\) : 'Folder'\}<\/small>/);
  assert.doesNotMatch(styles, /\.files-pane\.drop-target\s*\{[^}]*box-shadow/s);
  assert.match(styles, /\.files-pane\.drop-target \.file-drop-overlay\s*\{[^}]*display:\s*flex/s);
  // The upload status now lives in the tab strip, asserted above via
  // [data-pane-upload-status]; the old .file-pane-title grid is gone.
  assert.doesNotMatch(styles, /\.file-pane-title/);
  assert.match(styles, /\.pane-tab-strip \.pane-kind-icon,\s*\.pane-tab-strip \.pane-upload-status\s*\{/);
});

test('file detail rows share the exact column boundaries of their header', () => {
  assert.match(styles, /\.compact-file-row\s*\{[^}]*grid-template-columns:\s*var\(--file-column-template\)[^}]*gap:\s*0[^}]*padding:\s*1px 0[^}]*border-left:\s*0[^}]*border-right:\s*0/s);
  assert.match(styles, /\.compact-file-row \.file-name,\s*\.compact-file-row \.file-modified,\s*\.compact-file-row \.file-size\s*\{[^}]*padding:\s*0 5px/s);
});

test('terminal title and bell sequences update pane names and browser notifications', () => {
  assert.match(appSource, /term\.onTitleChange\(\(title\) => updatePaneTitleFromTerminal\(paneId, terminalTabId, title\)\)/);
  assert.match(appSource, /term\.onBell\(\(\) => showTerminalNotification\(paneId\)\)/);
  for (const code of [9, 99, 777]) {
    assert.match(appSource, new RegExp(`term\\.parser\\.registerOscHandler\\(${code},`));
  }
  assert.match(appSource, /function handleTerminalOscNotification\(paneId, code, data\)/);
  assert.match(appSource, /new Notification\(/);
  assert.match(appSource, /Notification\.requestPermission\(\)/);
  assert.match(appSource, /name="terminal\.browser_notifications"/);
  assert.match(appSource, /function browserNotificationCapability\(\)/);
  assert.match(appSource, /window\.isSecureContext/);
  assert.match(appSource, /Notification\.permission === 'denied'/);
  assert.match(appSource, /data-browser-notification-status/);
  assert.match(appSource, /notificationInput\?\.disabled/);
});

test('the board is one grid: fixed-width columns, rows dividing the viewport', () => {
  // The pane placement and the dashed backdrop must read the same two
  // variables, or a pane would snap to cells that are not the ones drawn.
  assert.match(appSource, /--grid-size: \$\{gridSize\(\)\}px; --vertical-slots: \$\{verticalSlots\(\)\};/);
  assert.match(appSource, /grid-column: \$\{layout\.x \+ 1\} \/ span \$\{layout\.w\}; grid-row: \$\{layout\.y \+ 1\} \/ span \$\{layout\.h\}/);
  assert.match(styles, /\.pane-grid\s*\{[^}]*grid-auto-columns:\s*var\(--grid-size, 120px\)/s);
  assert.match(styles, /\.pane-grid\s*\{[^}]*grid-template-rows:\s*repeat\(var\(--vertical-slots, 12\), 1fr\)/s);
  assert.match(styles, /\.pane-grid\s*\{[^}]*overflow-x:\s*auto/s);
});

test('the board paints dashed cell rules that scroll with it', () => {
  assert.match(styles, /\.pane-grid\s*\{[^}]*conic-gradient\(at 1px var\(--grid-dash\)[^}]*conic-gradient\(at var\(--grid-dash\) 1px/s);
  assert.match(styles, /background-size:\s*\n?\s*var\(--grid-size, 120px\) var\(--grid-period\),\s*\n?\s*var\(--grid-period\) calc\(100% \/ var\(--vertical-slots, 12\)\)/s);
  // local keeps the rules nailed to the cells instead of the viewport
  assert.match(styles, /\.pane-grid\s*\{[^}]*background-attachment:\s*local/s);
});

test('panes resize from every edge and snap to whole cells', () => {
  const source = appSource.slice(appSource.indexOf('function startPaneResize'), appSource.indexOf('function startPaneMove'));
  for (const direction of ['n', 'ne', 'e', 'se', 's', 'sw', 'w', 'nw']) {
    assert.match(appSource, new RegExp(`data-pane-resize-direction="\\$\\{direction\\}"|'${direction}'`));
  }
  // Whole-cell deltas, so a pane can never land between cells
  assert.match(source, /const cell = pointerCell\(grid, moveEvent\.clientX, moveEvent\.clientY\)/);
  assert.match(source, /const dx = cell\.x - startCell\.x/);
  assert.match(source, /const dy = cell\.y - startCell\.y/);
  assert.match(source, /candidate\.w = startLayout\.w \+ dx/);
  assert.match(source, /candidate\.h = startLayout\.h \+ dy/);
  assert.match(source, /candidate\.w < 1/);
  assert.match(appSource, /function pointerCell\(grid, clientX, clientY\)/);
  // the board scrolls, so the pointer must be resolved in board coordinates
  assert.match(appSource, /clientX - rect\.left \+ grid\.scrollLeft\) \/ gridSize\(\)/);
});

test('panes share one plane: an overlapping drop is shown and refused', () => {
  assert.match(appSource, /function layoutsOverlap\(a, b\)/);
  assert.match(appSource, /a\.x < b\.x \+ b\.w && b\.x < a\.x \+ a\.w && a\.y < b\.y \+ b\.h && b\.y < a\.y \+ a\.h/);
  assert.match(appSource, /function wouldOverlap\(tab, paneId, layout\)/);
  // flagged live while dragging, not only after the drop is rejected
  const move = appSource.slice(appSource.indexOf('function startPaneMove'), appSource.indexOf('async function savePaneLayoutLocal'));
  assert.match(move, /classList\.toggle\('invalid', wouldOverlap\(found\.tab, paneId, nextLayout\)\)/);
  assert.match(move, /if \(wouldOverlap\(found\.tab, paneId, nextLayout\)\) \{\s*applyPaneLayoutStyle\(paneElement, startLayout\)/);
  assert.match(styles, /\.pane\.invalid\s*\{[^}]*outline:\s*2px solid var\(--danger\)/s);
  assert.match(mainSource, /res\.status\(409\)\.json\(\{ error: 'That space is taken by another pane\.' \}\)/);
});

test('saving the grid settings reshapes the board without a reload', () => {
  // cell width applies straight away; a new row count comes back rescaled
  assert.match(appSource, /grid\.setAttribute\('style', boardStyle\(\)\)/);
  // repositioned in place: a full render would drop every terminal connection
  assert.match(appSource, /if \(state\.config\.layoutChanged\) \{\s*const loaded = await api\('\/api\/state'\)/);
  assert.match(appSource, /applyPaneLayoutStyle\(document\.querySelector\(`\[data-pane="\$\{pane\.id\}"\]`\), pane\.layout\);\s*paneTerminal\(pane\.id\)\?\.sendResize\(\)/);
  assert.match(mainSource, /const layoutChanged = store\.applyGrid\(config\.ui\.grid_size, config\.ui\.vertical_slots, config\.ui\.default_pane_width, config\.ui\.default_pane_height\)/);
  assert.match(mainSource, /publicConfig\(config, shell, restartRequired, configReloadError\), layoutChanged \}/);
});

test('dragging a pane moves it by whole cells', () => {
  const source = appSource.slice(appSource.indexOf('function startPaneMove'), appSource.indexOf('async function savePaneLayoutLocal'));
  assert.match(source, /x: startLayout\.x \+ \(cell\.x - startCell\.x\)/);
  assert.match(source, /y: startLayout\.y \+ \(cell\.y - startCell\.y\)/);
  assert.match(source, /paneElement\.classList\.add\('dragging'\)/);
});

test('the pane kind icon drags the pane and still toggles focus mode on double click', () => {
  const source = appSource.slice(appSource.indexOf('function startPaneMove'), appSource.indexOf('async function savePaneLayoutLocal'));
  // preventDefault on pointerdown suppresses the compatibility dblclick, and
  // capturing on the title bar retargets it away from the icon, so a drag that
  // starts on the icon does neither.
  assert.match(source, /const icon = event\.target\.closest\('\.pane-kind-icon'\);\s*if \(!icon\) \{\s*event\.preventDefault\(\);\s*\}/);
  assert.match(source, /const dragSurface = icon \|\| title;\s*dragSurface\.setPointerCapture\(event\.pointerId\)/);
  assert.match(source, /dragSurface\.addEventListener\('pointermove', onMove\)/);
  assert.match(source, /dragSurface\.addEventListener\('pointerup', onUp\)/);
  assert.match(appSource, /function wirePaneKindIcon\(root\)[\s\S]*?togglePaneFocus\(icon\.closest\('\[data-pane\]'\)\?\.dataset\.pane\)/);
});

test('focus mode is desktop only and releases a pane narrowed into mobile', () => {
  // Mobile shows one pane at a time, so there is nothing for focus mode to do,
  // and it sized itself from window.innerHeight into the area behind the URL bar.
  assert.match(appSource, /function togglePaneFocus\(paneId\) \{[\s\S]*?if \(!paneId \|\| isMobileLayout\(\)\) \{\s*return;/);
  // Nothing on mobile can leave focus mode, so narrowing a focused desktop
  // window has to release the pane itself.
  const viewportUpdate = appSource.slice(
    appSource.indexOf('function updateVisualViewport()'),
    appSource.indexOf('const terminal = paneTerminal(state.activePaneId);', appSource.indexOf('function updateVisualViewport()'))
  );
  assert.match(viewportUpdate, /if \(!isMobileLayout\(\)\) \{\s*return;\s*\}[\s\S]*?exitPaneFocus\(\);/);
});

test('Escape leaves focus mode from every pane type, but a terminal keeps its Escape key', () => {
  // Capture phase, or xterm and the whiteboard canvas eat the key first.
  assert.match(appSource, /function enterPaneFocus\(paneId\)[\s\S]*?document\.addEventListener\('keydown', paneFocusKeydown, true\)/);
  assert.match(appSource, /function exitPaneFocus\(\)[\s\S]*?document\.removeEventListener\('keydown', paneFocusKeydown, true\)/);
  const handler = appSource.slice(appSource.indexOf('function paneFocusKeydown'), appSource.indexOf('function exitPaneFocus'));
  assert.match(handler, /event\.target\.closest\?\.\('\.inline-rename, input'\)/);
  // vim, less and PSReadLine all need Escape, so a terminal takes two in a row.
  assert.match(appSource, /const PANE_FOCUS_ESCAPE_MS = 500;/);
  assert.match(handler, /paneElement\?\.dataset\.paneType === 'terminal'[\s\S]*?now - state\.paneFocusEscapeAt > PANE_FOCUS_ESCAPE_MS[\s\S]*?state\.paneFocusEscapeAt = now;\s*return;/);
  // Any other key in between restarts the pair.
  assert.match(handler, /event\.key !== 'Escape'\) \{\s*state\.paneFocusEscapeAt = 0;\s*return;/);
  assert.match(handler, /event\.stopPropagation\(\);\s*exitPaneFocus\(\)/);
});

test('focus mode zooms the pane so its contents grow with it', () => {
  const enter = appSource.slice(appSource.indexOf('function enterPaneFocus'), appSource.indexOf('function paneFocusKeydown'));
  // Growing the pane alone only fits more, smaller content in. The layout size
  // stays as it was and CSS zoom does the growing, so a focused terminal keeps
  // its column count in larger type.
  assert.match(enter, /const scale = Math\.max\(1, focusWidth \/ rect\.width \|\| 1\);/);
  assert.match(enter, /setProperty\('--pane-focus-scale'/);
  assert.match(enter, /setProperty\('--pane-focus-width', `\$\{Math\.round\(focusWidth \/ scale\)\}px`\)/);
  assert.match(enter, /setProperty\('--pane-focus-height', `\$\{Math\.round\(focusHeight \/ scale\)\}px`\)/);
  assert.match(styles, /\.pane-grid \.pane\.pane-focused \{[^}]*zoom: var\(--pane-focus-scale, 1\)/);
  const exit = appSource.slice(appSource.indexOf('function exitPaneFocus'), appSource.indexOf('function closePaneFocusFromOutside'));
  assert.match(exit, /removeProperty\('--pane-focus-scale'\)/);
});

test('a zoomed pane scales the remote browser instead of handing it more room', () => {
  // Sizing the remote page from the painted box would keep its text at the same
  // size in focus mode and just show more of the page.
  assert.match(appSource, /function browserViewportSize\(viewport\)[\s\S]*?viewport\.offsetWidth[\s\S]*?viewport\.offsetHeight/);
  assert.match(appSource, /function browserScaleFactor\(viewport\)[\s\S]*?\(window\.devicePixelRatio \|\| 1\) \* paneZoomFactor\(viewport\)/);
  assert.match(appSource, /function paneZoomFactor\(element\)[\s\S]*?getBoundingClientRect\(\)\.width \/ \(element\.offsetWidth \|\| 1\)/);
  // Zoom leaves the layout box alone, so nothing else tells the remote browser
  // that focus mode came or went.
  assert.match(appSource, /function enterPaneFocus[\s\S]*?state\.browserConnections\.get\(paneId\)\?\.refreshViewport\(\)/);
  assert.match(appSource, /function exitPaneFocus[\s\S]*?state\.browserConnections\.get\(state\.focusedPaneId\)\?\.refreshViewport\(\)/);
  // The context menu sits inside the pane, so pointer pixels come back out of the zoom.
  assert.match(appSource, /\(event\.clientX - rect\.left\) \/ zoom, viewport\.offsetWidth - 120/);
});

test('the whiteboard host plugin lazy-loads a fully offline Excalidraw', () => {
  // Without EXCALIDRAW_ASSET_PATH the bundle silently falls back to unpkg.com,
  // which would break a portable, offline install.
  assert.match(whiteboardClientSource, /window\.EXCALIDRAW_ASSET_PATH = `\$\{assetBaseUrl\}excalidraw\/`/);
  assert.match(whiteboardClientSource, /\['react\.js', 'react-dom\.js', 'jsx-runtime\.js', 'excalidraw\.js'\]/);
  assert.match(whiteboardClientSource, /window\.ReactDOM\.createRoot\(host\)/);
  assert.match(whiteboardClientSource, /window\.ExcalidrawLib\.Excalidraw/);
  assert.match(whiteboardClientSource, /Wps7HostPanePlugins\.whiteboard/);
  assert.match(coreAppSource, /loadHostPanePlugins\(state\.pluginPanes\)/);
  assert.doesNotMatch(coreAppSource, /mountWhiteboard|loadExcalidraw|state\.whiteboards/);
  for (const file of ['excalidraw.js', 'react.js', 'react-dom.js', 'jsx-runtime.js']) {
    assert.ok(
      fs.existsSync(path.join(__dirname, '..', 'plugin-panes', 'whiteboard', 'assets', 'excalidraw', file)),
      `vendored ${file} is missing`
    );
  }
});

test('host panes can refresh cached offsets after their pane slides', () => {
  // Excalidraw only re-reads its container offsets when the container resizes,
  // so scrolling the board, dragging a pane to other cells, or opening the
  // sidebar used to leave the pointer mapped to the pane's old position.
  assert.match(whiteboardClientSource, /excalidrawAPI: \(api\) => \{ entry\.api = api; \}/);
  assert.match(whiteboardClientSource, /for \(const entry of whiteboards\.values\(\)\) \{\s*entry\.api\?\.refresh\(\);/);

  const grid = appSource.slice(appSource.indexOf('function wirePaneGrid'), appSource.indexOf('function wireBoardScroll'));
  assert.match(grid, /grid\.addEventListener\('scroll', refreshHostPaneOffsets, \{ passive: true \}\)/);
  assert.match(grid, /new ResizeObserver\(refreshHostPaneOffsets\)\.observe\(grid\)/);

  const layout = appSource.slice(appSource.indexOf('function applyPaneLayoutStyle'), appSource.indexOf('function applyPaneLayoutUpdates'));
  assert.match(layout, /refreshHostPaneOffsets\(\);/);
});

test('the freeform canvas, its camera, and the in-house drawing layer are gone', () => {
  for (const symbol of [
    'activeCamera', 'clampZoom', 'applyCameraTransform', 'pointerToWorld', 'saveCameraSoon',
    'bringPaneToFront', 'nextPaneZ', 'snapUnit', 'GRID_MINOR_UNIT', 'MIN_ZOOM',
    'drawTool', 'drawSelection', 'DRAW_STYLE_FIELDS', 'activeDrawings', 'updateDrawHandles'
  ]) {
    assert.doesNotMatch(appSource, new RegExp(symbol), `${symbol} should be gone`);
  }
  // the column model that briefly replaced the canvas is gone too
  for (const symbol of ['tabColumns', 'panesInColumn', 'ensurePaneColumn', 'dropTargetAt', 'saveColumn']) {
    assert.doesNotMatch(appSource, new RegExp(symbol), `${symbol} should be gone`);
  }
  assert.doesNotMatch(styles, /\.draw-layer|\.draw-toolbar|\.pane-canvas|\.pane-column|\.column-resize/);
});

test('switching panes clears file selections and their range anchors', () => {
  assert.match(appSource, /function clearFileSelections\(\)/);
  assert.match(appSource, /state\.selectedFiles\[paneId\] = \[\]/);
  assert.match(appSource, /filesPaneData\(paneId\)\.selectionAnchor = -1/);
  assert.match(appSource, /document\.querySelectorAll\('\[data-files-pane\]'\)\.forEach\(\(paneElement\) => syncFileSelectionUi/);
  assert.match(appSource, /async function setActivePane\(paneId, reloadFiles = true\)[\s\S]*?clearFileSelections\(\);[\s\S]*?state\.activePaneId = paneId/);
  assert.match(appSource, /function selectFileRow[\s\S]*?state\.activePaneId !== paneId[\s\S]*?setActivePane\(paneId, false\);[\s\S]*?state\.selectedFiles\[paneId\] = \[row\.dataset\.fileRow\]/);
});

test('activating an existing Files pane does not reload its contents', () => {
  const paneControlsSource = appSource.slice(appSource.indexOf('function wirePaneControls'), appSource.indexOf('function startPaneSwipe'));
  assert.match(paneControlsSource, /setActivePane\(pane\.dataset\.pane, pane\.dataset\.paneType !== 'files'\)/);
});

test('file list starts with a compact parent-directory row', () => {
  assert.match(appSource, /class="file-row compact-file-row file-parent-row"[\s\S]*?data-file-parent="\$\{escapeAttr\(paneData\.parent\)\}"/);
  assert.match(appSource, /file-parent-row[\s\S]*?fileActionIcon\('up'\)[\s\S]*?<span>\.\.<\/span>[\s\S]*?class="file-item-count"[\s\S]*?selectedPaths\.length \? `\$\{selectedPaths\.length\}\/\$\{entries\.length\} items` : `\$\{entries\.length\} items`/);
  assert.match(styles, /\.file-parent-row\s*\{[^}]*grid-template-columns:\s*var\(--file-column-template\)/s);
  assert.match(styles, /\.file-item-count\s*\{[^}]*display:\s*inline-flex[^}]*width:\s*max-content[^}]*justify-self:\s*end[^}]*border-radius:/s);
  assert.match(appSource, /\[data-file-parent\][\s\S]*?button\.ondblclick[\s\S]*?setFilesPanePath\(paneId, button\.dataset\.fileParent\)/);
  assert.match(appSource, /button\.onkeydown[\s\S]*?event\.key === 'Enter'[\s\S]*?setFilesPanePath\(paneId, button\.dataset\.fileParent\)/);
  assert.doesNotMatch(appSource, /button\.onclick = \(\) => setFilesPanePath\(paneId, button\.dataset\.fileParent\)/);
  assert.doesNotMatch(appSource, /class="file-selection-count"/);
  assert.match(appSource, /itemCount\.textContent = selected\.length \? `\$\{selected\.length\}\/\$\{total\} items` : `\$\{total\} items`/);
});

test('show hidden files is stored in shared server configuration', () => {
  assert.match(appSource, /showHidden:\s*Boolean\(state\.config\.file_manager\?\.show_hidden\)/);
  assert.match(appSource, /file_manager:\s*\{ show_hidden:\s*showHidden \}/);
  assert.match(mainSource, /next\.file_manager\.show_hidden = updates\.file_manager\.show_hidden/);
});

test('every rendered files pane loads independently', () => {
  assert.doesNotMatch(appSource, /else if \(pane\.id === state\.activePaneId\) \{\s*loadFilesPane\(pane\)/);
  assert.match(appSource, /else \{\s*loadFilesPane\(pane\);\s*\}/);
});

test('files pane uses one coherent svg icon per action', () => {
  assert.doesNotMatch(appSource, /□＋|▱＋|⇧□|⇧▱/);
  for (const icon of ['terminal', 'up', 'refresh', 'new-folder', 'upload-file', 'upload-folder', 'download', 'copy', 'rename', 'delete', 'hidden', 'star', 'drive', 'file', 'folder']) {
    assert.match(appSource, new RegExp(`fileActionIcon\\('${icon}'\\)`));
  }
  assert.match(appSource, /fileActionIcon\(allSelected \? 'deselect-all' : 'select-all'\)/);
  assert.match(appSource, /<svg class="file-action-icon"[^>]+aria-hidden="true"/);
  assert.match(styles, /\.file-action-icon\s*\{[^}]*width:\s*15px[^}]*height:\s*15px/s);
  assert.match(appSource, /refresh:\s*'<g class="refresh-shape">/);
  assert.match(styles, /\.file-action-icon\s*\{[^}]*stroke-width:\s*1\.7[^}]*stroke-linecap:\s*round[^}]*stroke-linejoin:\s*round/s);
  assert.doesNotMatch(styles, /\.refresh-shape \.refresh-arc\s*\{/);
});

test('file rows use row selection without leading checkboxes', () => {
  assert.doesNotMatch(appSource, /class="file-select"|data-file-select=/);
  assert.doesNotMatch(styles, /\.compact-file-row \.file-select/);
  assert.match(styles, /\.compact-file-row\s*\{[^}]*grid-template-columns:\s*var\(--file-column-template\)/s);
  assert.match(appSource, /row\.classList\.toggle\('selected', selectedRow\)/);
});

test('file columns resize and the list owns the remaining pane height', () => {
  assert.match(appSource, /data-file-column-resize="name"/);
  assert.match(appSource, /data-file-column-resize="modified"/);
  assert.match(appSource, /data-file-column-resize="size"/);
  assert.match(appSource, /handle\.setPointerCapture\(event\.pointerId\)/);
  assert.match(styles, /\.files-pane \.file-list\s*\{[^}]*grid-row:\s*2/s);
  assert.match(styles, /\.file-column-resizer\s*\{[^}]*cursor:\s*col-resize/s);
  assert.match(styles, /\.compact-file-row \.file-modified,\s*\.compact-file-row \.file-size\s*\{[^}]*min-width:\s*0[^}]*overflow:\s*hidden[^}]*text-overflow:\s*ellipsis[^}]*white-space:\s*nowrap/s);
});

test('double-click opens text files in Notepad and downloads binary files', () => {
  assert.match(appSource, /async function openFileRow\(row, paneId\)/);
  assert.match(appSource, /api\(`\/api\/files\/text\?path=\$\{encodeURIComponent\(path\)\}`\)/);
  assert.match(appSource, /if \(error\.status === 415\)\s*\{\s*await downloadFiles\(\[path\], paneId\)/s);
});

test('Notepad uses a compact neutral line-number gutter', () => {
  assert.match(appSource, /split\(\/\\r\\n\|\\r\|\\n\/\)/);
  assert.doesNotMatch(appSource, /lineNumberWidth/);
  assert.match(styles, /\.notepad-editor-shell\s*\{[^}]*grid-template-columns:\s*max-content minmax\(0, 1fr\)/s);
  assert.match(styles, /\.notepad-pane\s*\{[^}]*--notepad-divider:\s*color-mix\(in srgb, var\(--text\) 16%, var\(--terminal-bg\)\)/s);
  assert.match(styles, /\.notepad-gutter\s*\{[^}]*border-right:\s*1px solid var\(--notepad-divider\) !important/s);
  assert.match(styles, /\.notepad-editor:focus-visible\s*\{[^}]*outline:\s*none/s);
  assert.match(styles, /\.notepad-toolbar\s*\{[^}]*border-bottom:\s*1px solid var\(--notepad-divider\)/s);
});

test('Notepad uses compact popovers, four-space tabs, and synchronized wrapped rows', () => {
  assert.match(appSource, /data-notepad-font-toggle[^>]*>\$\{fileActionIcon\('font'\)\}<\/button>/);
  assert.match(appSource, /data-notepad-font-popover[^>]*role="dialog"/);
  assert.match(appSource, /data-notepad-font-size-popover[^>]*role="dialog"/);
  assert.match(appSource, /data-notepad-find-popover[^>]*role="dialog"/);
  assert.match(appSource, /data-notepad-replace-popover[^>]*role="dialog"/);
  assert.match(appSource, /data-notepad-find-prev[^>]*>\$\{fileActionIcon\('browser-back'\)\}<\/button>/);
  assert.match(appSource, /data-notepad-find-next[^>]*>\$\{fileActionIcon\('browser-forward'\)\}<\/button>/);
  assert.match(appSource, /data-notepad-replace-one[^>]*>\$\{fileActionIcon\('replace'\)\}<\/button>/);
  assert.match(appSource, /data-notepad-replace-all[^>]*>\$\{fileActionIcon\('replace-all'\)\}<\/button>/);
  assert.match(appSource, /notepadEdit\(editor, editor\.selectionStart, editor\.selectionEnd, ' {4}'\)/);
  assert.match(appSource, /function syncNotepadRows\(paneElement, editor, gutter, guides\)/);
  assert.match(appSource, /function renderNotepadIndentGuides\(content/);
  assert.match(styles, /\.notepad-toolbar\s*\{[^}]*justify-content:\s*flex-start/s);
  assert.match(styles, /\.notepad-popover\s*\{[^}]*position:\s*absolute/s);
  assert.match(styles, /\.notepad-find-popover,\s*\.notepad-replace-popover\s*\{[^}]*top:\s*50%[^}]*left:\s*50%[^}]*transform:\s*translate\(-50%, -50%\)/s);
  assert.match(appSource, /function closeNotepadPopoversFromOutside\(event\)/);
  assert.match(appSource, /changePaneFontSize\(paneId, -1\)/);
  assert.match(appSource, /changePaneFontSize\(paneId, 1\)/);
  assert.match(styles, /tab-size:\s*4/);
  assert.doesNotMatch(styles, /\.notepad-editor-shell\.indent-guides-on \.notepad-editor\s*\{[^}]*repeating-linear-gradient/s);
});

test('notepad find fields have one-click clear buttons', () => {
  assert.equal(appSource.split('data-notepad-find-clear').length - 1, 3);
  assert.match(appSource, /querySelectorAll\('\[data-notepad-find-clear\]'\)/);
  assert.match(appSource, /find\.query = ''/);
  assert.match(appSource, /input\.focus\(\)/);
  assert.match(styles, /grid-template-columns:\s*minmax\(120px, 1fr\) repeat\(3, 26px\)/);
});

test('notepad find and replace popovers are draggable and closeable', () => {
  assert.match(appSource, /class="notepad-popover-header" data-notepad-popover-drag/);
  assert.match(appSource, /data-notepad-popover-close aria-label="Close find"/);
  assert.match(appSource, /data-notepad-popover-close aria-label="Close replace"/);
  assert.match(appSource, /function wireNotepadPopoverDrag\(popover\)/);
  assert.match(appSource, /handle\.setPointerCapture\(event\.pointerId\)/);
  assert.match(appSource, /wirePopover\('\[data-notepad-find\]', '\[data-notepad-find-popover\]', true\)/);
  assert.match(appSource, /wirePopover\('\[data-notepad-replace\]', '\[data-notepad-replace-popover\]', true\)/);
  assert.match(appSource, /if \(persistent\) \{[\s\S]*?wireNotepadPopoverDrag\(popover\)/);
  assert.match(styles, /\.notepad-popover-header\s*\{[^}]*grid-column:\s*1 \/ -1[^}]*cursor:\s*move/s);
  assert.match(styles, /\.notepad-popover-header \.notepad-popover-close\s*\{/);
});

test('notepad tab strip stays wired from the pane container and matches the other panes', () => {
  assert.match(appSource, /wireNotepadTabs\(paneElement\.closest\('\.pane'\) \|\| paneElement, paneId\)/);
  assert.match(appSource, /const newTabButton = paneElement\.querySelector\('\[data-notepad-new-tab\]'\);\s*\n\s*if \(newTabButton\) newTabButton\.onclick = \(\) => addNotepadTab\(paneId, ''\);/);
  assert.doesNotMatch(appSource, /\[data-notepad-new-tab\]'\)\?\.addEventListener/);
  assert.match(styles, /\.notepad-tab-close\s*\{[^}]*width:\s*16px[^}]*height:\s*16px/s);
  // The new-tab button follows the shared 22px control instead of notepad's
  // own scale, so it matches the close button sitting beside it.
  assert.match(styles, /\.notepad-new-tab\s*\{[^}]*flex:\s*0 0 22px[^}]*width:\s*22px/s);
  // It should appear only in the shared 13px icon rule, with no override.
  assert.equal(styles.split('.notepad-new-tab .file-action-icon').length - 1, 1);
});

test('notepad toolbar handlers replace instead of stacking so font size steps by one', () => {
  assert.match(appSource, /if \(fontSizeOutButton\) fontSizeOutButton\.onclick = \(\) => changePaneFontSize\(paneId, -1\);/);
  assert.match(appSource, /if \(fontSizeInButton\) fontSizeInButton\.onclick = \(\) => changePaneFontSize\(paneId, 1\);/);
  assert.doesNotMatch(appSource, /data-notepad-font-size-(?:in|out|reset)\]'\)\?\.addEventListener/);
  assert.doesNotMatch(appSource, /data-notepad-(?:find|replace)-(?:prev|next|one|all)\]'\)\?\.addEventListener/);
  assert.doesNotMatch(appSource, /data-notepad-popover-close\]'\)\?\.addEventListener/);
  assert.match(appSource, /paneElement\._notepadResizeObserver\?\.disconnect\(\);/);
});

test('notepad find and replace popovers stay inside the editor area at any canvas zoom', () => {
  assert.match(appSource, /function clampNotepadPopover\(popover, left, top\)/);
  assert.match(appSource, /popover\.closest\('\.notepad-pane'\)\?\.querySelector\('\.notepad-editor-shell'\)/);
  assert.match(appSource, /const scale = parentRect\.width \/ parent\.offsetWidth \|\| 1;/);
  assert.match(appSource, /start\.left \+ \(moveEvent\.clientX - startX\) \/ start\.scale/);
  assert.match(appSource, /start\.top \+ \(moveEvent\.clientY - startY\) \/ start\.scale/);
  assert.match(appSource, /if \(candidateOpen && candidate\.querySelector\('\[data-notepad-popover-drag\]'\)\) \{\s*\n\s*placeNotepadPopover\(candidate\);/);
});

test('opening a file that is already open focuses its existing notepad tab', () => {
  assert.match(appSource, /function findOpenNotepadTab\(tab, path\)/);
  assert.match(appSource, /const opened = findOpenNotepadTab\(tab, path\);/);
  assert.match(appSource, /await activateNotepadTabClient\(opened\.pane\.id, opened\.notepadTab\.id\);/);
  assert.match(appSource, /function samePath\(left, right\)/);
});

test('notepad word wrap, indent guides, and auto save defaults come from settings', () => {
  assert.match(appSource, /<section class="settings-section" id="settings-notepad">/);
  assert.match(appSource, /name="ui\.notepad_word_wrap" type="checkbox"/);
  assert.match(appSource, /name="ui\.notepad_indent_guides" type="checkbox"/);
  assert.match(appSource, /name="ui\.notepad_autosave" type="checkbox"/);
  assert.match(appSource, /notepad_word_wrap: form\.get\('ui\.notepad_word_wrap'\) === 'on'/);
  assert.match(appSource, /notepad_indent_guides: form\.get\('ui\.notepad_indent_guides'\) === 'on'/);
  assert.match(appSource, /notepad_autosave: form\.get\('ui\.notepad_autosave'\) === 'on'/);
  assert.match(mainSource, /function notepadDefaults\(config\)/);
  assert.match(mainSource, /store\.createNotepadPane\(req\.params\.paneId, targetPath, notepadDefaults\(config\)\)/);
  assert.match(mainSource, /store\.createNotepadTab\(req\.params\.paneId, targetPath, notepadDefaults\(config\)\)/);
});

test('remote browser sizes its window so screencast frames fill the pane without distortion', () => {
  assert.match(browserSource, /async ensureWindowFits\(\)/);
  assert.match(browserSource, /async calibrateWindowInsets\(\)/);
  assert.match(browserSource, /Browser\.getWindowForTarget/);
  assert.match(browserSource, /Browser\.setWindowBounds/);
  assert.match(browserSource, /width: this\.viewport\.width \+ insets\.width/);
  assert.match(browserSource, /height: this\.viewport\.height \+ insets\.height/);
  assert.match(browserSource, /async applyViewport\(\) \{[\s\S]*?await this\.ensureWindowFits\(\)/);
});

test('Notepad titles show file names and pathless saves use a server-side location picker', () => {
  assert.match(appSource, /function notepadTabLabel\(tab\)/);
  assert.match(appSource, /split\(\/\[\\\\\/\]\//);
  assert.match(appSource, /function openNotepadSaveDialog\(paneId, tabId\)/);
  assert.match(appSource, /class="app-modal notepad-save-dialog"/);
  assert.match(appSource, /api\('\/api\/files\/drives'\)/);
  assert.match(appSource, /api\(`\/api\/files\?path=\$\{encodeURIComponent\(location\)\}`\)/);
  assert.match(appSource, /const selectedPath = await openNotepadSaveDialog\(paneId, tabId\)/);
  assert.match(styles, /\.notepad-save-directory-list\s*\{[^}]*overflow:\s*auto/s);
});

test('WebRTC browser video fills the pane while preserving remote input coordinates', () => {
  assert.match(styles, /\.browser-video\s*\{[^}]*object-fit:\s*fill/s);
  assert.match(appSource, /if \(streamMode === 'webrtc'\)[\s\S]*?rect\.width[\s\S]*?contentWidth[\s\S]*?rect\.height[\s\S]*?contentHeight/);
});

test('Notepad persists autosave drafts and editor toggles through the server state', () => {
  assert.match(appSource, /async function persistNotepadTabState\(paneId, tabId/);
  assert.match(appSource, /if \(!tab\.path && silent\)/);
  assert.match(appSource, /content:\s*data\.content/);
  assert.match(mainSource, /req\.body\.content !== undefined/);
  assert.match(mainSource, /\['readOnly', 'wrap', 'indentGuides', 'autosave'\]/);
  assert.match(mainSource, /req\.body\[key\] !== undefined/);
});

test('notepad autosave updates the tab strip without replacing the focused editor', () => {
  const saveSource = appSource.slice(appSource.indexOf('async function saveNotepadTab'), appSource.indexOf('async function persistNotepadTabState'));
  assert.match(saveSource, /if \(silent\) \{\s*updateNotepadTabStrip\(paneId\);\s*\} else \{\s*updateNotepadPane\(paneId\);\s*\}/);
  assert.doesNotMatch(saveSource, /\n\s*updateNotepadPane\(paneId\);\s*\n\s*if \(!silent\)/);
});

test('Notepad highlights syntax through an overlay under a transparent textarea', () => {
  assert.match(appSource, /const notepadLanguages = \{/);
  for (const language of ['clike', 'python', 'powershell', 'sql', 'css', 'markup', 'markdown', 'yaml']) {
    assert.match(appSource, new RegExp(`\\n    ${language}: \\{`));
  }
  assert.match(appSource, /function notepadLanguageId\(tab, data\)/);
  assert.match(appSource, /function notepadTokens\(text, spec\)/);
  assert.match(appSource, /function notepadHighlightHtml\(text, spec, decorations = \[\]\)/);
  assert.match(appSource, /const MAX_NOTEPAD_HIGHLIGHT_LENGTH = 400000/);
  assert.match(appSource, /shell\.classList\.toggle\('highlight-off', disabled\)/);
  assert.match(appSource, /<pre class="notepad-highlight"[^>]*><code data-notepad-highlight><\/code><\/pre>/);
  // The overlay only shows through because the textarea paints no glyphs of its own.
  assert.match(styles, /\.notepad-editor\s*\{[^}]*color:\s*transparent[^}]*caret-color:\s*var\(--text\)/s);
  assert.match(styles, /\.notepad-editor-shell\.highlight-off \.notepad-editor\s*\{[^}]*color:\s*var\(--text\)/s);
  assert.match(styles, /\.notepad-highlight\s*\{[^}]*position:\s*absolute[^}]*pointer-events:\s*none/s);
  assert.match(styles, /\.notepad-editor-shell\.wrap-on \.notepad-editor,\s*\.notepad-editor-shell\.wrap-on \.notepad-highlight\s*\{[^}]*white-space:\s*pre-wrap/s);
  for (const token of ['comment', 'string', 'keyword', 'number', 'tag', 'attr']) {
    assert.match(styles, new RegExp(`:root\\s*\\{[^}]*--code-${token}:`, 's'));
    assert.match(styles, new RegExp(`:root\\[data-theme="light"\\]\\s*\\{[^}]*--code-${token}:`, 's'));
    assert.match(styles, new RegExp(`\\.code-${token} \\{ color: var\\(--code-${token}\\)`));
  }
});

test('Notepad matches brackets and marks the caret line', () => {
  assert.match(appSource, /function notepadBracketPartner\(text, index\)/);
  assert.match(appSource, /function notepadBracketRanges\(text, caret\)/);
  assert.match(appSource, /className: 'notepad-bracket'/);
  assert.match(appSource, /function notepadAutoClose\(editor, event\)/);
  assert.match(appSource, /function updateNotepadCurrentLine\(context\)/);
  assert.match(appSource, /marker\.style\.top = `\$\{row\.offsetTop - gutter\.offsetTop - editor\.scrollTop\}px`/);
  assert.match(styles, /\.notepad-bracket\s*\{[^}]*outline:\s*1px solid var\(--accent\)/s);
  assert.match(styles, /\.notepad-current-line\s*\{[^}]*position:\s*absolute[^}]*pointer-events:\s*none/s);
});

test('Notepad search offers case, whole word, regex, wrap around, and mark all', () => {
  assert.match(appSource, /function notepadSearchPattern\(options\)/);
  assert.match(appSource, /if \(options\.wholeWord\) source = `\\\\b\(\?:\$\{source\}\)\\\\b`/);
  assert.match(appSource, /options\.matchCase \? 'g' : 'gi'/);
  assert.match(appSource, /if \(!options\.wrapAround\) return -1/);
  assert.match(appSource, /function notepadMatches\(text, options\)/);
  assert.match(appSource, /function updateNotepadSearchCount\(context\)/);
  for (const option of ['matchCase', 'wholeWord', 'regex', 'wrapAround', 'markAll']) {
    assert.match(appSource, new RegExp(`toggle\\('${option}',`));
  }
  assert.match(appSource, /data-notepad-search-option="\$\{key\}"/);
  assert.match(appSource, /data-notepad-search-count/);
  assert.match(appSource, /function notepadReplaceAll\(context\)/);
  // Only regex mode may treat the replacement as a substitution template.
  assert.match(appSource, /find\.regex \? find\.replace : find\.replace\.replaceAll\('\$', '\$\$\$\$'\)/);
  assert.match(appSource, /const inSelection = editor\.selectionEnd > editor\.selectionStart/);
  assert.match(styles, /\.notepad-mark\s*\{[^}]*background:\s*color-mix/s);
  assert.match(styles, /\.notepad-mark\.current\s*\{/);
});

test('Notepad exposes Notepad++ line, case, sort, and undo commands', () => {
  assert.match(appSource, /const notepadCommands = \{/);
  for (const command of [
    'duplicate-line', 'delete-line', 'move-line-up', 'move-line-down', 'upper-case', 'lower-case',
    'toggle-comment', 'sort-ascending', 'sort-descending', 'remove-duplicates', 'trim-trailing',
    'tabs-to-spaces', 'spaces-to-tabs'
  ]) {
    assert.match(appSource, new RegExp(`renderNotepadCommand\\('${command}',`));
    assert.match(appSource, new RegExp(`'${command}': \\(`));
  }
  assert.match(appSource, /undo: \(\) => document\.execCommand\('undo'\)/);
  assert.match(appSource, /redo: \(\) => document\.execCommand\('redo'\)/);
  assert.match(appSource, /data-notepad-command="undo"/);
  assert.match(appSource, /data-notepad-command="redo"/);
  // Edits run through execCommand so the textarea's native undo stack survives them.
  assert.match(appSource, /function notepadEdit\(editor, start, end, text, selectionStart, selectionEnd\)/);
  assert.match(appSource, /text \? document\.execCommand\('insertText', false, text\) : document\.execCommand\('delete'\)/);
  assert.doesNotMatch(appSource, /editor\.value = editor\.value\.split\(query\)/);
  assert.match(appSource, /const NOTEPAD_SHORTCUTS = \{/);
  assert.match(appSource, /function notepadIndentLines\(editor, outdent\)/);
  assert.match(appSource, /function notepadToggleComment\(editor, spec\)/);
  assert.match(styles, /\.notepad-menu\s*\{[^}]*overflow-y:\s*auto/s);
  assert.match(styles, /\.notepad-menu button\[aria-checked="true"\]\s*\{/);
});

test('Notepad navigates by line number and bookmarks', () => {
  assert.match(appSource, /function notepadGoToLine\(context, line\)/);
  assert.match(appSource, /function notepadJumpBookmark\(context, backward\)/);
  assert.match(appSource, /data-notepad-goto-input/);
  for (const command of ['go-to-line', 'toggle-bookmark', 'next-bookmark', 'previous-bookmark', 'clear-bookmarks']) {
    assert.match(appSource, new RegExp(`'${command}'`));
  }
  assert.match(appSource, /row\.className = bookmarks\.has\(index\) \? 'notepad-gutter-line bookmarked' : 'notepad-gutter-line'/);
  assert.match(appSource, /if \(!data\.bookmarks\.delete\(line\)\) data\.bookmarks\.add\(line\)/);
  assert.match(styles, /\.notepad-gutter-line\.bookmarked\s*\{[^}]*color:\s*var\(--accent\)/s);
});

test('Notepad reports and converts line endings, encoding, and language', () => {
  assert.match(appSource, /function renderNotepadStatusBar\(data, languageId\)/);
  for (const cell of ['language', 'length', 'caret', 'eol', 'encoding', 'mode']) {
    assert.match(appSource, new RegExp(`data-notepad-status-${cell}`));
  }
  assert.match(appSource, /function updateNotepadStatusBar\(context\)/);
  assert.match(appSource, /Ln \$\{rows\.length\}, Col \$\{rows\.at\(-1\)\.length \+ 1\}, Sel \$\{editor\.selectionEnd - editor\.selectionStart\}/);
  assert.match(appSource, /const notepadEolLabels = \{ crlf: 'Windows \(CRLF\)', lf: 'Unix \(LF\)', cr: 'Macintosh \(CR\)' \}/);
  assert.match(appSource, /function detectNotepadEol\(text\)/);
  assert.match(appSource, /function applyNotepadEol\(text, eol\)/);
  // A textarea normalizes newlines, so the file's own ending has to be restored on save.
  assert.match(appSource, /content: result\.content\.replace\(\/\\r\\n\|\\r\|\\n\/g, '\\n'\)/);
  assert.match(appSource, /eol: detectNotepadEol\(result\.content\)/);
  assert.match(appSource, /content: applyNotepadEol\(data\.content, data\.eol\)/);
  assert.match(appSource, /renderNotepadCommand\(`eol:\$\{value\}`/);
  assert.match(appSource, /renderNotepadCommand\(`encoding:\$\{value\}`/);
  assert.match(appSource, /renderNotepadCommand\(`language:\$\{id\}`/);
  assert.match(mainSource, /\['crlf', 'lf', 'cr'\]\.includes\(req\.body\.eol\)/);
  assert.match(mainSource, /Unsupported line ending\./);
  assert.match(styles, /\.notepad-status-bar\s*\{[^}]*height:\s*20px/s);
  assert.match(styles, /\.notepad-pane\s*\{[^}]*grid-template-rows:\s*auto minmax\(0, 1fr\) auto/s);
});

test('Notepad can reload, lock, and bulk close its file tabs', () => {
  assert.match(appSource, /async function reloadNotepadTab\(paneId, tabId\)/);
  assert.match(appSource, /if \(data\.dirty && !window\.confirm\('Discard unsaved changes and reload from disk\?'\)\) return/);
  assert.match(appSource, /async function closeNotepadTabs\(paneId, keepTabId\)/);
  assert.match(appSource, /'close-all': \(context\) => closeNotepadTabs\(context\.paneId, null\)/);
  assert.match(appSource, /'close-others': \(context\) => closeNotepadTabs\(context\.paneId, context\.tabId\)/);
  assert.match(appSource, /data\.readOnly \? 'readonly' : ''/);
  assert.match(appSource, /renderNotepadCommand\('toggle-read-only', 'Read only', '', data\.readOnly\)/);
  assert.match(appSource, /if \(data\.readOnly\) return;/);
});

test('all pane chrome shares a compact 28px toolbar language', () => {
  assert.match(styles, /:root\s*\{[^}]*--pane-toolbar-height:\s*28px/s);
  assert.match(styles, /\.pane-title\s*\{[^}]*height:\s*var\(--pane-toolbar-height\)[^}]*min-height:\s*var\(--pane-toolbar-height\)/s);
  assert.match(styles, /\.file-location-row,\s*\.file-command-bar\s*\{[^}]*height:\s*var\(--pane-toolbar-height\)/s);
  assert.match(styles, /\.file-column-heading > button\s*\{[^}]*height:\s*var\(--pane-toolbar-height\)/s);
  assert.match(styles, /\.notepad-toolbar\s*\{[^}]*height:\s*var\(--pane-toolbar-height\)/s);
  assert.match(styles, /\.mobile-keybar\s*\{[^}]*display:\s*flex[^}]*height:\s*var\(--pane-toolbar-height\)/s);
  assert.match(styles, /\.browser-toolbar\s*\{[^}]*height:\s*var\(--pane-toolbar-height\)[^}]*padding:\s*0/s);
  assert.match(styles, /\.browser-toolbar \.file-location-row\s*\{[^}]*height:\s*100%/s);
});

test('PowerShell shortcut bar sits directly below the pane title', () => {
  assert.match(appSource, /: `\s*\$\{renderMobileKeybar\(\)\}\s*\$\{renderTerminalSurfaces\(pane\)\}/s);
  assert.match(styles, /\.pane\[data-pane-type="terminal"\]\s*\{[^}]*grid-template-rows:\s*auto auto minmax\(0, 1fr\)/s);
});

test('compact pane toolbars paginate buttons instead of scrolling horizontally', () => {
  assert.match(appSource, /function wirePagedToolbars\(root\)/);
  assert.match(appSource, /new ResizeObserver\(\(\) => updatePagedToolbar\(toolbar\)\)/);
  assert.match(appSource, /data-toolbar-page="previous"/);
  assert.match(appSource, /data-toolbar-page="next"/);
  assert.match(appSource, /availableWidth = toolbar\.clientWidth - previous\.offsetWidth - next\.offsetWidth/);
  assert.match(appSource, /class="mobile-keybar"[^>]*data-paged-toolbar/);
  assert.match(appSource, /class="file-command-bar"[^>]*data-paged-toolbar/);
  assert.match(appSource, /class="notepad-toolbar"[^>]*data-paged-toolbar/);
  assert.match(styles, /\.paged-toolbar-button\s*\{[^}]*flex:\s*0 0 auto/s);
  assert.match(styles, /\.file-command-bar\s*\{[^}]*overflow:\s*hidden/s);
  assert.match(styles, /\.mobile-keybar\s*\{[^}]*overflow:\s*hidden/s);
  assert.doesNotMatch(appSource, /keybar\.scrollLeft \+= delta/);
});

test('desktop PowerShell buttons size to their label and paginate during pane resize', () => {
  // A fixed 52px slot made an arrow key as wide as Shift and paged buttons away
  // sooner than the pane needed to.
  assert.match(styles, /\.mobile-keybar \[data-toolbar-item\]\s*\{[^}]*width:\s*auto[^}]*min-width:\s*34px/s);
  assert.doesNotMatch(styles, /\.mobile-keybar \[data-toolbar-item\][^{]*\{[^}]*max-width:\s*52px/s);
  assert.match(appSource, /title="\$\{escapeAttr\(mobileKeybarButtonName\(button\)\)\}"/);
  assert.match(styles, /\.mobile-keybar \.paged-toolbar-button\s*\{[^}]*width:\s*28px[^}]*max-width:\s*28px/s);
  assert.match(appSource, /function applyPaneLayoutStyle\(paneElement, layout\)[\s\S]*?syncPaneTitleWidth\(paneElement\);[\s\S]*?paneElement\.querySelectorAll\('\[data-paged-toolbar\]'\)\.forEach\(updatePagedToolbar\)/);
});

test('toolbar paging survives activation from another pane', () => {
  assert.match(appSource, /function activatePagedToolbarPane\(toolbar, event\)/);
  assert.match(appSource, /event\.stopPropagation\(\);[\s\S]*?setActivePane\(pane\.dataset\.pane, false\)/);
  assert.match(appSource, /previous\.onclick = \(event\) => \{\s*activatePagedToolbarPane\(toolbar, event\)/s);
  assert.match(appSource, /next\.onclick = \(event\) => \{\s*activatePagedToolbarPane\(toolbar, event\)/s);
});

test('browser zoom uses ten-percent steps and briefly reveals controls for shortcuts', () => {
  assert.match(appSource, /delta:\s*-0\.1/);
  assert.match(appSource, /delta:\s*0\.1/);
  assert.match(appSource, /showBrowserZoomPopover\(paneId\)/);
  assert.match(appSource, /window\.setTimeout\(\(\) =>[\s\S]*?, 1000\)/);
  assert.match(browserSource, /Math\.round\(Number\(value\) \* 10\) \/ 10/);
});

test('checkbox-free file rows expose selection and keyboard behavior', () => {
  assert.match(appSource, /role="listbox" aria-label="Files" aria-multiselectable="true"/);
  assert.match(appSource, /role="option" aria-selected="\$\{selectedPaths\.includes\(entry\.path\)\}"/);
  assert.match(appSource, /row\.setAttribute\('aria-selected', String\(selectedRow\)\)/);
  assert.match(appSource, /row\.onkeydown = \(event\) =>/);
  assert.match(appSource, /event\.key === ' '/);
  assert.match(appSource, /event\.key === 'Enter'/);
});

test('mobile tabs and settings remain usable above the sidebar', () => {
  assert.match(styles, /\.tab\.tab-add\s*\{[^}]*min-width:\s*42px[^}]*flex:\s*0 0 42px/s);
  assert.match(styles, /\.settings-overlay\s*\{[^}]*z-index:\s*var\(--z-settings\)/s);
  assert.match(appSource, /data-settings-close aria-label="Close settings"/);
  for (const label of ['Appearance', 'Terminal', 'Workspace', 'Shell', 'Files', 'Server and security']) {
    assert.match(appSource, new RegExp(`aria-label="${label}"[^>]+href="#settings-`));
  }
});

test('settings navigation maps to real sections and follows the visible section', () => {
  for (const section of ['appearance', 'terminal', 'workspace', 'shell', 'files', 'notepad', 'usage', 'server']) {
    assert.match(appSource, new RegExp(`<section class="settings-section[^"]*" id="settings-${section}"`));
  }
  // Every nav entry must point at a section that exists, and every section must
  // be reachable from the nav.
  const navTargets = [...appSource.matchAll(/<a aria-label="[^"]+" href="#(settings-[a-z-]+)">/g)].map((match) => match[1]);
  const sectionIds = [...appSource.matchAll(/<section class="settings-section[^"]*" id="(settings-[a-z-]+)"/g)].map((match) => match[1]);
  assert.deepEqual(navTargets, sectionIds);
  assert.match(appSource, /function setActiveSettingsSection\(sectionId\)/);
  assert.match(appSource, /settingsBody\.addEventListener\('scroll', syncSettingsNav/);
  assert.match(appSource, /new ResizeObserver\(\(\) => \{\s*syncSettingsScrollPadding\(\);\s*syncSettingsNav\(\);\s*\}\)/);
  assert.match(appSource, /settingsResizeObserver\.disconnect\(\)/);
  assert.match(appSource, /link\.onclick = \(event\) =>/);
  assert.match(appSource, /requestAnimationFrame\(\(\) => setActiveSettingsSection\(section\.id\)\)/);
});

test('settings use a compact, minimal density tighter than the legacy workspace panel', () => {
  assert.match(styles, /\.settings-panel\s*\{[^}]*width:\s*min\(860px,[^}]*height:\s*min\(600px/s);
  assert.match(styles, /\.settings-shell\s*\{[^}]*grid-template-columns:\s*164px minmax\(0, 1fr\)/s);
  assert.match(styles, /\.settings-nav a\s*\{[^}]*min-height:\s*30px/s);
  assert.match(styles, /\.settings-body\s*\{[^}]*padding:\s*12px 14px 16px/s);
  assert.match(styles, /\.settings-footer\s*\{[^}]*min-height:\s*44px/s);
});

test('settings sizes against the visual viewport so the footer stays on screen', () => {
  // `100vh` on a phone spans the collapsible URL bar, which pushed Cancel,
  // Apply and Save below the visible area.
  assert.match(styles, /\.settings-overlay\s*\{[^}]*height:\s*var\(--app-height, 100dvh\)/s);
  assert.match(styles, /\.settings-panel\s*\{[^}]*max-height:\s*calc\(var\(--app-height, 100dvh\) - 32px\)/s);
  assert.match(styles, /\.settings-panel\s*\{[^}]*height:\s*min\(600px, calc\(var\(--app-height, 100dvh\) - 32px\)\)/s);
  assert.match(styles, /@media \(max-width:\s*760px\)[\s\S]*?\.settings-panel\s*\{[^}]*height:\s*calc\(var\(--app-height, 100dvh\) - 12px\)/s);
  const settingsRules = styles.replace(/\/\*[\s\S]*?\*\//g, '').match(/\.settings-(overlay|panel)\s*\{[^}]*\}/gs) || [];
  assert.ok(settingsRules.length >= 4);
  for (const rule of settingsRules) {
    assert.ok(!/\d+vh/.test(rule), `settings rule still sizes against vh: ${rule}`);
  }
});

test('settings read as rows with the control right aligned against a shared edge', () => {
  assert.match(styles, /\.settings-grid > label,\s*\.settings-grid > \.settings-wide\s*\{[^}]*border-bottom:\s*1px solid var\(--line\)/s);
  assert.match(styles, /\.settings-grid > label\s*\{[^}]*justify-content:\s*space-between/s);
  assert.match(styles, /\.settings-grid input,[\s\S]*?\.settings-grid textarea\s*\{[^}]*width:\s*132px/s);
  // Checkboxes reverse so their box lands on the same edge as the text fields.
  assert.match(styles, /\.settings-check\s*\{[^}]*flex-direction:\s*row-reverse/s);
});

test('settings fields that hold long text span both columns and stretch', () => {
  assert.match(styles, /\.settings-grid > \.settings-wide\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\)/s);
  assert.match(styles, /\.settings-wide input,[\s\S]*?\.settings-wide textarea\s*\{[^}]*width:\s*auto/s);
});

test('settings rows drop to one column with full-size hit targets on mobile', () => {
  const mobile = styles.slice(styles.indexOf('@media (max-width: 760px)'));
  assert.match(mobile, /\.settings-grid\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\)/s);
  assert.match(mobile, /\.settings-grid input,[\s\S]*?\.settings-grid textarea\s*\{[^}]*min-height:\s*34px/s);
});

test('settings apply stays open while save closes the dialog', () => {
  assert.match(appSource, /data-settings-apply title="Save and keep this dialog open">Apply<\/button>/);
  assert.match(appSource, /data-settings-save title="Save and close">Save<\/button>/);
  assert.match(appSource, /const keepSettingsOpen = event\.submitter\?\.hasAttribute\('data-settings-apply'\) === true/);
  assert.match(appSource, /if \(!keepSettingsOpen\) \{\s*state\.customThemeDraft = null;\s*closeSettings\(false\);\s*\}/);
});

// A title attribute never shows on a phone and only shows on desktop after a
// hover pause, so what a setting does has to be on the page.
test('every settings row explains itself in visible text, not a title attribute', () => {
  const settingsMarkup = appSource.slice(appSource.indexOf('<div class="settings-body">'), appSource.indexOf('<footer class="settings-footer">'));
  assert.doesNotMatch(settingsMarkup, /<label[^>]*\stitle="/);
  assert.doesNotMatch(settingsMarkup, /<(?:input|select|textarea)[^>]*\stitle="/);
  for (const name of ['ui.system_font_size', 'ui.grid_size', 'ui.vertical_slots', 'persistence.autosave_minutes', 'shell.preferred', 'usage.warn_percent', 'usage.alert_percent', 'server.port']) {
    assert.match(settingsMarkup, new RegExp(`name="${name.replace('.', '\\.')}"[^>]*>\\s*<small class="field-hint"`));
  }
  // The hint wraps onto its own full-width line below the row, including in the
  // reversed checkbox rows.
  assert.match(styles, /\.settings-grid label:not\(\.settings-wide\) > \.field-hint\s*\{[^}]*flex:\s*1 0 100%[^}]*order:\s*1/s);
  assert.match(styles, /\.settings-check\s*\{[^}]*flex-wrap:\s*wrap/s);
});

test('single-field settings sections are folded into the section they belong to', () => {
  assert.doesNotMatch(appSource, /id="settings-persistence"|id="settings-security"/);
  const workspace = settingsSection('settings-workspace');
  assert.match(workspace, /name="persistence\.autosave_minutes"/);
  const server = settingsSection('settings-server');
  assert.match(server, /name="auth\.password"/);
  assert.match(server, /<h2>Server &amp; security<\/h2>/);
  // Grouped rows carry a subhead saying what the group is for.
  for (const subhead of ['Board grid', 'New panes', 'Saving', 'Provider cards', 'Quota windows']) {
    assert.match(appSource, new RegExp(`<h3 class="settings-subhead">${subhead}`));
  }
  assert.match(styles, /\.settings-subhead small\s*\{[^}]*display:\s*block/s);
});

test('rarely used settings sit behind an Advanced disclosure', () => {
  assert.match(settingsSection('settings-server'), /<details class="settings-advanced">\s*<summary>Advanced<\/summary>[\s\S]*name="server\.allowed_hosts"/);
  assert.match(settingsSection('settings-usage'), /<details class="settings-advanced">\s*<summary>Advanced<\/summary>[\s\S]*name="usage\.codex_home"/);
  assert.match(styles, /\.settings-advanced > summary\s*\{[^}]*cursor:\s*pointer/s);
  assert.match(styles, /\.settings-advanced > summary:focus-visible\s*\{[^}]*outline:\s*2px solid var\(--accent\)/s);
});

test('MiniMax credentials only appear while its provider card is shown', () => {
  const usage = settingsSection('settings-usage');
  assert.match(usage, /<div data-minimax-setting class="minimax-setting \$\{settings\.usage\?\.show_minimax !== false \? '' : 'hidden'\}">/);
  assert.match(usage, /name="usage\.minimax_api_key"/);
  assert.match(appSource, /minimaxToggle\.onchange = \(\) => \{\s*overlay\.querySelector\('\[data-minimax-setting\]'\)\.classList\.toggle\('hidden', !minimaxToggle\.checked\);/);
  assert.match(styles, /\.minimax-setting\.hidden\s*\{\s*display:\s*none/s);
  // Nothing to forget until a key has been saved.
  assert.match(usage, /settings\.usage\?\.minimax_configured \? '<label class="settings-check"><input name="usage\.clear_minimax_api_key"/);
});

test('the upload limit shows the size its byte count allows', () => {
  assert.match(appSource, /function uploadLimitHint\(bytes\)/);
  assert.match(appSource, /Largest single upload: \$\{formatBytes\(size\)\}/);
  assert.match(appSource, /'No limit\. Enter a size in bytes to cap a single upload\.'/);
  assert.match(appSource, /uploadLimitInput\.oninput = \(\) => \{\s*overlay\.querySelector\('\[data-upload-limit-hint\]'\)\.textContent = uploadLimitHint\(uploadLimitInput\.value\);/);
});

test('path dropdown combines current, history, and bookmarked paths', () => {
  assert.doesNotMatch(appSource, /data-file-bookmark(?:[=>\s])/);
  assert.doesNotMatch(appSource, /data-file-bookmarks|function renderBookmarks/);
  assert.match(appSource, /filePathHistory:\s*loadFilePathHistory\(\)/);
  assert.match(appSource, /function rememberFilePath\(path\)/);
  assert.match(appSource, /class="file-path-menu"[^>]+role="listbox"/);
  assert.match(appSource, /state\.filePathHistory\s*\.filter\(\(path\) => path\.toLowerCase\(\) !== currentPath\)\s*\.slice\(0, 5\)/);
  assert.match(appSource, /class="file-path-heading"[^>]*>Current<\/div>[\s\S]*class="file-path-divider"[^>]+role="separator"[\s\S]*class="file-path-heading"[^>]*>History<\/div>[\s\S]*class="file-path-divider"[^>]+role="separator"[\s\S]*class="file-path-heading"[^>]*>Bookmark<\/div>/);
  assert.match(appSource, /data-path-kind="\$\{kind\}"/);
  assert.match(appSource, /data-file-path-choice=/);
  assert.match(appSource, /data-path-bookmark=/);
  assert.match(appSource, /aria-label="\$\{bookmarked \? 'Remove' : 'Add'\} bookmark/);
  assert.match(appSource, /function togglePathBookmark\(path, paneId\)/);
  assert.match(styles, /\.file-path-menu\s*\{[^}]*position:\s*absolute[^}]*z-index:\s*20/s);
  assert.match(styles, /\.file-path-toggle\s*\{[^}]*display:\s*grid[^}]*place-items:\s*center/s);
  assert.match(appSource, /data-file-path-toggle[^>]*>\$\{fileActionIcon\('chevron-down'\)\}<\/button>/);
  assert.match(styles, /\.file-path-toggle \.file-action-icon\s*\{[^}]*display:\s*block/s);
  assert.match(styles, /\.file-path-divider\s*\{[^}]*border-top:\s*1px solid var\(--line\)/s);
});

test('file path input navigates when Enter is pressed', () => {
  const filesPaneWireSource = appSource.slice(appSource.indexOf('function wireFilesPane'), appSource.indexOf('function selectedFileList'));
  assert.match(filesPaneWireSource, /pathInput\?\.addEventListener\('keydown', \(event\) => \{[\s\S]*?event\.key === 'Enter'[\s\S]*?event\.preventDefault\(\);[\s\S]*?setFilesPanePath\(paneId, pathInput\.value\)/);
});

test('file rows use solid icons, dim hidden entries, and toggle select all', () => {
  assert.match(styles, /\.compact-file-row \.file-name \.file-action-icon\s*\{[^}]*fill:\s*currentColor/s);
  assert.match(appSource, /entry\.hidden \? 'hidden-entry' : ''/);
  assert.match(styles, /\.compact-file-row\.hidden-entry\s*\{[^}]*opacity:\s*\.48/s);
  assert.match(appSource, /function allVisibleFilesSelected\(paneId\)/);
  assert.match(appSource, /allSelected \? 'Deselect all' : 'Select all'/);
  assert.match(appSource, /state\.selectedFiles\[paneId\] = allVisibleFilesSelected\(paneId\) \? \[\] : visibleFilePaths\(paneId\)/);
  assert.match(appSource, /fileActionIcon\(allSelected \? 'deselect-all' : 'select-all'\)/);
});

test('appearance stores separate light and dark choices with separate custom palettes', () => {
  for (const theme of ['WPS7 Dark', 'WPS7 Light', 'Slate Dark', 'Slate Light', 'Ember Dark', 'Ember Light', 'Forest Dark', 'Forest Light', 'Custom']) {
    assert.match(appSource, new RegExp(theme));
  }
  const presetsSource = appSource.slice(appSource.indexOf('const themePresets'), appSource.indexOf('const customThemeDefaults'));
  assert.doesNotMatch(presetsSource, /label: '(?:Apple|Claude|Codex) /);
  for (const themeId of ['slate-dark', 'slate-light', 'ember-dark', 'ember-light', 'forest-dark', 'forest-light']) {
    assert.match(presetsSource, new RegExp(`'${themeId}'`));
  }
  assert.doesNotMatch(presetsSource, /'(?:apple|claude|codex)-(?:dark|light)'/);
  const themeValidationSource = mainSource.slice(mainSource.indexOf('const lightThemeIds'), mainSource.indexOf("if (updates.custom_theme.mode"));
  assert.match(themeValidationSource, /'slate-light'.*'ember-light'.*'forest-light'/);
  assert.match(themeValidationSource, /'slate-dark'.*'ember-dark'.*'forest-dark'/);
  assert.doesNotMatch(themeValidationSource, /'(?:apple|claude|codex)-(?:dark|light)'/);
  for (const field of ['mode', 'selected_light', 'selected_dark', 'ink', 'panel', 'rail', 'surface', 'line', 'text', 'muted', 'accent', 'warn', 'danger', 'terminal_bg', 'terminal_fg', 'light_ink', 'light_panel', 'light_rail', 'light_surface', 'light_line', 'light_text', 'light_muted', 'light_accent', 'light_warn', 'light_danger', 'light_terminal_bg', 'light_terminal_fg']) {
    assert.match(appSource, new RegExp(`custom_theme\\.${field}`));
  }
  assert.match(appSource, /data-theme-mode="light"/);
  assert.match(appSource, /data-theme-mode="dark"/);
  assert.match(appSource, /function selectedThemeForMode\(mode\)/);
  assert.match(appSource, /selected_\$\{mode\}/);
  assert.match(appSource, /themePresets\[selected\]\?\.mode === mode/);
  assert.match(appSource, /const selectedLight = selectedThemeForMode\('light'\)/);
  assert.match(appSource, /const selectedDark = selectedThemeForMode\('dark'\)/);
  assert.match(appSource, /custom_theme:\s*customThemeFromForm\(form\)/);
  assert.match(mainSource, /custom_theme:\s*config\.custom_theme/);
  assert.match(mainSource, /if \(updates\.custom_theme\)/);
  assert.match(styles, /\.theme-preset-grid\s*\{/);
  assert.match(styles, /\.custom-theme-grid\s*\{/);
  assert.match(appSource, /applyTheme\(selectedThemeForMode\(state\.config\.custom_theme\?\.mode \|\| 'dark'\)\)/);
  assert.match(appSource, /JSON\.stringify\(\{ custom_theme: \{ mode: themeMode\(\) \} \}\)/);
});

test('custom light and dark palettes can be reset to their defaults', () => {
  assert.match(appSource, /data-custom-theme-reset="light"/);
  assert.match(appSource, /data-custom-theme-reset="dark"/);
  assert.match(appSource, /function resetCustomThemePalette\(mode, overlay\)/);
  assert.match(appSource, /customThemePaletteKeys/);
  assert.match(appSource, /state\.customThemeDraft\[field\] = customThemeDefaults\[field\]/);
  assert.match(appSource, /input\.value = customThemeDefaults\[field\]/);
  assert.match(appSource, /state\.theme === `custom-\$\{mode\}`[\s\S]*?setThemeLive\(state\.theme\)/);
  assert.match(styles, /\.custom-theme-heading\s*\{[^}]*display:\s*flex/s);
});

test('light terminal palettes use a dark warning color for ANSI yellow text', () => {
  assert.match(appSource, /yellow:\s*palette\.warn/);
  assert.match(appSource, /brightYellow:\s*palette\.warn/);
  assert.match(appSource, /'wps-light':[\s\S]*?warn:\s*'#8a4f00'/);
});

test('terminal chrome follows the active preset background', () => {
  assert.match(appSource, /'terminal-bg':\s*palette\.terminalBg/);
  assert.match(appSource, /'terminal-fg':\s*palette\.terminalFg/);
  assert.match(styles, /\.terminal \.xterm,[\s\S]*?background:\s*var\(--terminal-bg\) !important/);
});

test('files pane clears stale entries and shows a friendly empty error state', () => {
  const loadSource = appSource.slice(appSource.indexOf('async function loadFilesPane'), appSource.indexOf('async function setFilesPanePath'));
  assert.match(loadSource, /paneData\.entries = \[\];\s*paneData\.drives = \[\];\s*updateFilesPane\(pane\.id\);/);
  assert.match(loadSource, /catch \(error\) \{[\s\S]*?paneData\.entries = \[\];[\s\S]*?paneData\.error = friendlyFileError\(error\.message\)/);
  assert.match(appSource, /function friendlyFileError\(message\)/);
  assert.match(appSource, /ENOENT\|no such file/);
  assert.match(appSource, /class="file-empty-state" role="note"/);
  assert.match(appSource, /paneData\.error \|\| \(paneData\.filter \? 'No files match your search\.' : 'This folder is empty\.'\)/);
  assert.doesNotMatch(appSource, /class="file-error"/);
  assert.match(styles, /\.file-empty-state\s*\{[^}]*flex-direction:\s*column/s);
  assert.match(styles, /\.files-pane \{[^}]*grid-template-rows:\s*auto minmax\(0, 1fr\)/s);
  assert.match(styles, /\.files-pane \.file-list\s*\{[^}]*grid-row:\s*2/s);
});

test('upload controls are keyboard reachable buttons', () => {
  assert.match(appSource, /data-file-upload-trigger role="button" tabindex="\$\{pane\.path \? '0' : '-1'\}" aria-disabled="\$\{pane\.path \? 'false' : 'true'\}"/);
  assert.match(appSource, /data-file-upload-trigger\]'\)\.forEach\(\(trigger\) => \{[\s\S]*?event\.key !== 'Enter' && event\.key !== ' '[\s\S]*?querySelector\('input\[type="file"\]'\)\?\.click\(\)/);
});

test('file create, rename and delete use an app modal with live validation instead of native dialogs', () => {
  assert.match(appSource, /function openAppModal\(\{ title/);
  assert.match(appSource, /function validateFileName\(name\)/);
  assert.match(appSource, /function confirmDialog\(title, message/);
  assert.doesNotMatch(appSource, /window\.prompt\('Folder name'\)|window\.prompt\('File name'\)|window\.prompt\('New name'\)/);
  assert.doesNotMatch(appSource, /window\.confirm\('Delete this item permanently\?'\)/);
  assert.match(appSource, /class="app-modal" role="dialog" aria-modal="true"/);
  assert.match(styles, /\.app-modal-overlay\s*\{[^}]*position:\s*fixed[^}]*place-items:\s*center/s);
  assert.match(styles, /\.app-modal-danger\s*\{[^}]*border:\s*1px solid var\(--danger\)/s);
});

test('app modals stay above the software keyboard and scroll their body instead', () => {
  // Every app modal holds a text field, so the keyboard always opens on it.
  // Centred on the layout viewport, the field and the footer sat behind it.
  assert.match(styles, /\.app-modal-overlay\s*\{[^}]*height:\s*var\(--app-height, 100dvh\)/s);
  assert.match(styles, /\.app-modal\s*\{[^}]*max-height:\s*100%/s);
  assert.match(styles, /\.app-modal-body\s*\{[^}]*min-height:\s*0[^}]*overflow:\s*auto/s);
  // The save dialog's folder list sized itself against vh for the same reason.
  assert.match(styles, /\.notepad-save-directory-list\s*\{[^}]*max-height:\s*min\(320px, calc\(var\(--app-height, 100dvh\) \* \.45\)\)/s);
});

test('bulk download zips server-side and bulk delete uses a single reporting endpoint', () => {
  assert.match(mainSource, /app\.post\('\/api\/files\/download-archive'/);
  assert.match(mainSource, /app\.post\('\/api\/files\/delete-bulk'/);
  assert.match(appSource, /async function downloadFiles\(paths, paneId\)[\s\S]*?paths\.length === 1[\s\S]*?'\/api\/files\/download-archive'/);
  assert.match(appSource, /'\/api\/files\/delete-bulk'[\s\S]*?results[\s\S]*?filter\(\(item\) => !item\.ok\)/);
});

test('narrow desktop mode surfaces a recovery banner that switches to mobile', () => {
  assert.match(appSource, /data-desktop-mode-banner role="status" hidden/);
  assert.match(appSource, /data-switch-mobile>Switch to mobile/);
  assert.match(appSource, /function updateDesktopModeBanner\(\)/);
  assert.match(appSource, /function setDisplayMode\(mode, persist = true\)/);
  assert.match(appSource, /state\.displayMode === 'desktop' && narrowViewport\(\) && !state\.dismissedDesktopBanner/);
  assert.match(styles, /\.desktop-mode-banner\s*\{[^}]*background:\s*var\(--accent-soft\)/s);
});

test('files pane exposes a context menu with cut, paste and keyboard shortcuts wired to the move API', () => {
  assert.match(appSource, /function openFileContextMenu\(paneId, anchorPath/);
  assert.match(appSource, /function cutFiles\(paths, paneId\)/);
  assert.match(appSource, /async function pasteFiles\(paneId\)/);
  assert.match(appSource, /'\/api\/files\/move'[\s\S]*?destination/);
  assert.match(appSource, /row\.oncontextmenu = \(event\) =>[\s\S]*?openFileContextMenu\(paneId, row\.dataset\.fileRow/);
  assert.match(appSource, /event\.key === 'F2'[\s\S]*?renameFile\(selected\[0\], paneId\)/);
  assert.match(appSource, /event\.key === 'Delete'[\s\S]*?deleteFiles\(selected, paneId\)/);
  assert.match(appSource, /key === 'x'[\s\S]*?cutFiles\(selected, paneId\)/);
  assert.match(appSource, /key === 'v'[\s\S]*?pasteFiles\(paneId\)/);
  assert.match(styles, /\.file-context-menu\s*\{[^}]*position:\s*fixed/s);
});

test('terminal pane exposes copy, paste, select all and clear without copy-on-select', () => {
  assert.match(appSource, /function openTerminalContextMenu\(terminalTabId, clientX, clientY\)/);
  assert.match(appSource, /element\.addEventListener\('contextmenu'[\s\S]*?openTerminalContextMenu\(terminalTabId, event\.clientX, event\.clientY\)/);
  // Copy reads the xterm buffer, so wrapped lines and row padding never reach the clipboard.
  assert.match(appSource, /function copyTerminalSelection\(terminalTabId\)[\s\S]*?terminalSelectionText\(term\)/);
  assert.match(appSource, /function pasteTerminalText\(terminalTabId\)[\s\S]*?navigator\.clipboard\.readText\(\)/);
  assert.match(appSource, /function selectAllTerminal\(terminalTabId\)[\s\S]*?term\.selectAll\(\)/);
  assert.match(appSource, /function clearTerminal\(terminalTabId\)[\s\S]*?term\.clear\(\)/);
  assert.match(styles, /\.terminal-context-menu\s*\{[^}]*position:\s*fixed/s);
  assert.doesNotMatch(appSource, /copyOnSelect|onSelectionChange/);
});

test('context menus clamp against the visible viewport, not the layout viewport', () => {
  // Clamping to window.innerHeight put a menu opened near the bottom of a
  // phone screen behind the URL bar, where its lower items could not be tapped.
  assert.match(appSource, /function viewportHeight\(\) \{\s*return window\.visualViewport\?\.height \|\| window\.innerHeight;/s);
  const clamps = [...appSource.matchAll(/menu\.style\.top = `\$\{Math\.min\(clientY, ([\w.?()]+) -/g)].map((match) => match[1]);
  assert.equal(clamps.length, 2);
  for (const clamp of clamps) {
    assert.equal(clamp, 'viewportHeight()', `menu still clamps to ${clamp}`);
  }
});

// The copy helpers only read an xterm buffer, so they can run against a headless
// terminal instead of a browser.
function loadTerminalSelectionText() {
  const start = appSource.indexOf('  function terminalRowIsFull(term, line) {');
  const end = appSource.indexOf('  function copyTerminalSelection(terminalTabId) {');
  assert.ok(start >= 0 && end > start, 'copy helpers not found in app.js');
  const context = vm.createContext({});
  vm.runInContext(appSource.slice(start, end), context);
  return context.terminalSelectionText;
}

function writeHeadless(term, data) {
  return new Promise((resolve) => term.write(data, resolve));
}

function selectionView(term, range) {
  return { cols: term.cols, buffer: term.buffer, getSelectionPosition: () => range };
}

test('copying a wrapped terminal line keeps it on one line', async () => {
  const terminalSelectionText = loadTerminalSelectionText();
  const term = new HeadlessTerminal({ allowProposedApi: true, cols: 20, rows: 10 });
  const long = 'abcdefghij'.repeat(5);

  await writeHeadless(term, `${long}\r\nshort\r\n`);

  const text = terminalSelectionText(selectionView(term, { start: { x: 0, y: 0 }, end: { x: 5, y: 3 } }));
  assert.deepEqual(text.split('\r\n'), [long, 'short']);
});

test('copying joins a full row ConPTY repainted without the wrap flag', async () => {
  const terminalSelectionText = loadTerminalSelectionText();
  const term = new HeadlessTerminal({ allowProposedApi: true, cols: 20, rows: 10 });

  // ConPTY fills the row and then issues its own CRLF, so the second row never
  // gets the wrap flag even though the text belongs to the line above it.
  await writeHeadless(term, `${'x'.repeat(20)}\r\ntail\r\n`);
  assert.equal(term.buffer.active.getLine(1).isWrapped, false);

  const text = terminalSelectionText(selectionView(term, { start: { x: 0, y: 0 }, end: { x: 4, y: 1 } }));
  assert.equal(text, `${'x'.repeat(20)}tail`);
});

test('copying keeps separate lines apart when the row above has room left', async () => {
  const terminalSelectionText = loadTerminalSelectionText();
  const term = new HeadlessTerminal({ allowProposedApi: true, cols: 20, rows: 10 });

  await writeHeadless(term, 'first\r\nsecond\r\n');

  const text = terminalSelectionText(selectionView(term, { start: { x: 0, y: 0 }, end: { x: 6, y: 1 } }));
  assert.deepEqual(text.split('\r\n'), ['first', 'second']);
});

test('a renamed terminal tab is pinned and stops following the shell title', () => {
  assert.match(appSource, /JSON\.stringify\(\{ processTitle: nextTitle \}\)/);
  assert.match(appSource, /if \(!nextTitle \|\| !tab \|\| tab\.titlePinned \|\| tab\.title === nextTitle\)/);
  assert.match(appSource, /tab\.titlePinned = true;/);
  assert.match(mainSource, /store\.setTerminalTabProcessTitle\(req\.params\.paneId, req\.params\.tabId, req\.body\.processTitle\)/);
});

test('closing a pane warns about terminals that are still running a command', () => {
  assert.match(appSource, /async function confirmBusyTerminals\(pane\)/);
  assert.match(appSource, /\/api\/panes\/\$\{pane\.id\}\/terminal\/busy/);
  assert.match(appSource, /if \(!await confirmBusyTerminals\(found\.pane\)\)/);
  assert.match(appSource, /is still running a command/);
  assert.match(mainSource, /app\.get\('\/api\/panes\/:paneId\/terminal\/busy'/);
});

test('terminal shortcuts use Ctrl+Shift so Ctrl+C still interrupts the shell', () => {
  assert.match(appSource, /term\.attachCustomKeyEventHandler\(\(event\) => terminalShortcut\(terminalTabId, event\)\)/);
  assert.match(appSource, /function terminalShortcut\(terminalTabId, event\)/);
  assert.match(appSource, /if \(!event\.ctrlKey \|\| !event\.shiftKey \|\| event\.altKey \|\| event\.metaKey\)/);
  for (const [key, handler] of [['c', 'copyTerminalSelection'], ['v', 'pasteTerminalText'], ['a', 'selectAllTerminal'], ['l', 'clearTerminal']]) {
    assert.match(appSource, new RegExp(`case '${key}':[\\s\\S]{0,80}?${handler}\\(terminalTabId\\)`));
  }
  // Ctrl/Shift+Insert stays usable in plain browser tabs that keep Ctrl+Shift+C.
  assert.match(appSource, /key === 'insert' && event\.ctrlKey !== event\.shiftKey/);
});

test('clearing a terminal also tells the server to drop its replay buffer', () => {
  assert.match(appSource, /ws\.send\(JSON\.stringify\(\{ type: 'clear' \}\)\)/);
});

test('files pane can filter entries by name', () => {
  assert.match(appSource, /data-file-filter-toggle/);
  assert.match(appSource, /data-file-filter\b/);
  assert.match(appSource, /\.filter\(\(entry\) => !filterText \|\| entry\.name\.toLowerCase\(\)\.includes\(filterText\)\)/);
  assert.match(styles, /\.file-filter-input\s*\{/);
});

test('mobile file rows grow to touch size while the toolbar matches desktop height, and narrow panes collapse to one column', () => {
  assert.match(styles, /\.app\.mode-mobile \.files-pane \.compact-file-row,[\s\S]*?min-height:\s*40px/s);
  assert.doesNotMatch(styles, /\.app\.mode-mobile \.files-pane \.file-command-button/);
  assert.match(styles, /@container \(max-width: 360px\)[\s\S]*?\.compact-file-row \.file-modified\s*\{[^}]*grid-row:\s*2/s);
});

test('reviewed compactness improvements use friendly font labels and stable controls', () => {
  assert.match(appSource, /\{ label: 'Consolas', value: 'Consolas,/);
  assert.match(appSource, /\$\{escapeHtml\(font\.label\)\}/);
  assert.match(appSource, /class="tab tab-add"[^>]*>\$\{fileActionIcon\('add'\)\}<\/button>/);
  assert.match(styles, /\.file-command-bar\s*\{[^}]*flex-wrap:\s*nowrap[^}]*overflow:\s*hidden/s);
});

test('double-clicking a picture in the files pane opens an image pane instead of downloading it', () => {
  assert.match(appSource, /if \(isImagePath\(path\)\) \{\s*await openImageForFile\(path\);/);
  assert.match(appSource, /IMAGE_PATH_PATTERN = \/\\.\(avif\|bmp\|gif\|ico\|jpe\?g\|png\|svg\|webp\)\$\/i/);
});

test('image pane offers stepping, rotation, zoom, fit, download and delete', () => {
  for (const attribute of [
    'data-image-step="-1"',
    'data-image-step="1"',
    'data-image-rotate="-90"',
    'data-image-rotate="90"',
    'data-image-zoom="out"',
    'data-image-zoom="in"',
    'data-image-fit',
    'data-image-actual',
    'data-image-download',
    'data-image-delete'
  ]) {
    assert.ok(appSource.includes(attribute), `image toolbar is missing ${attribute}`);
  }
});

test('an image pane opened from the sidebar can browse for a picture itself', () => {
  // A file pane used to be the only thing that could set an image pane's path,
  // so a sidebar button on its own would hand out a pane with no way to fill it.
  assert.match(appSource, /data-action="image"[^>]+aria-label="New image pane"/);
  assert.match(appSource, /\[data-action="image"\][^\n]+openImagePane\(\)/);
  assert.ok(appSource.includes('data-image-open'), 'image pane is missing its open control');
  assert.match(appSource, /o: \(\) => chooseImageForPane\(paneId\)/);
  assert.match(appSource, /class="app-modal image-open-dialog"/);
  // Folders to walk into, pictures to pick; everything else stays out.
  assert.match(appSource, /entry\.type === 'directory' \|\| isImagePath\(entry\.name\)/);
  assert.match(styles, /\.image-open-list\s*\{[^}]*overflow:\s*auto/s);
  // The load error writes to its own element so the open button survives it.
  assert.match(appSource, /emptyText\.textContent = 'Could not load image\.'/);
  // The button sits inside the stage, whose pointer capture retargets pointerup
  // and the click that follows it. Without this the button did nothing at all.
  assert.match(appSource, /event\.button !== 0 \|\| event\.target\.closest\?\.\('\[data-image-open\]'\)/);
});

test('image zoom and rotation are applied as one transform on the picture', () => {
  assert.match(appSource, /translate\(\$\{data\.offsetX\}px, \$\{data\.offsetY\}px\) scale\(\$\{data\.scale\}\) rotate\(\$\{data\.rotation\}deg\) translate\(-50%, -50%\)/);
  // A quarter turn has to swap the edges the fit is measured against.
  assert.match(appSource, /quarterTurned \? data\.naturalHeight : data\.naturalWidth/);
});

test('the picture is centred by its anchor, not by the layout box it overflows', () => {
  // A picture laid out taller than the stage gets aligned to the top edge, so
  // centring it through the grid put the transform off by half the overflow.
  const rules = styles.slice(styles.indexOf('.image-canvas {'), styles.indexOf('.image-canvas[hidden]'));
  assert.match(rules, /position:\s*absolute/);
  assert.match(rules, /top:\s*50%/);
  assert.match(rules, /left:\s*50%/);
  // The trailing translate does the centring; an origin shift would double it.
  assert.match(rules, /transform-origin:\s*0 0/);
  assert.doesNotMatch(rules, /grid-area/);
});

test('image pane chrome follows the shared pane toolbar height and theme tokens', () => {
  assert.match(styles, /\.image-toolbar\s*\{[^}]*height:\s*var\(--pane-toolbar-height\)/);
  assert.match(styles, /\.image-stage\s*\{[^}]*background:\s*var\(--terminal-bg\)/);
  assert.doesNotMatch(styles.slice(styles.indexOf('.image-pane {'), styles.indexOf('.pane-kind-icon {')), /#[0-9a-f]{3,6}\b/i);
});

test('images are streamed inline without letting an SVG run scripts', () => {
  assert.match(mainSource, /app\.get\('\/api\/files\/image'/);
  assert.match(mainSource, /'X-Content-Type-Options': 'nosniff'/);
  assert.match(mainSource, /'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; sandbox"/);
  assert.match(mainSource, /app\.get\('\/api\/files\/image-siblings'/);
});

test('files pane has no inline error strip above the list', () => {
  assert.doesNotMatch(styles, /\.file-error/);
});

test('light mode muted and accent text clears the 4.5:1 contrast floor', () => {
  // applyTheme() writes the palette as inline custom properties, so the JS
  // preset wins over the stylesheet. Asserting only the CSS block passes while
  // the running app keeps the old colour.
  assert.match(appSource, /'wps-light':[^}]*muted: '#5d6b78'[^}]*accent: '#0b7561'/);
  assert.match(appSource, /light_muted: '#5d6b78', light_accent: '#0b7561'/);
  // The stylesheet block is the no-JS fallback and has to stay in step.
  const lightStart = styles.indexOf(':root[data-theme="light"]');
  const light = styles.slice(lightStart, styles.indexOf('}', lightStart));
  assert.match(light, /--muted:\s*#5d6b78/);
  assert.match(light, /--accent:\s*#0b7561/);
  assert.match(light, /--accent-soft:\s*rgba\(11, 117, 97/);
});

test('pane tabs get their own focus ring because they are divs, not buttons', () => {
  assert.match(styles, /\.pane-tab:focus-visible,\s*\.browser-tab:focus-visible,\s*\.notepad-tab:focus-visible\s*\{[^}]*outline:\s*2px solid var\(--accent\)/);
});

test('a focused file toolbar button is distinguishable from a pressed one', () => {
  // Sharing one rule made a keyboard ring read as an active state.
  const active = styles.slice(styles.indexOf('.file-command-button.active {'));
  assert.match(active.slice(0, active.indexOf('}')), /background:\s*var\(--accent-soft\)/);
  assert.match(styles, /\.file-command-button:focus-visible\s*\{[^}]*outline:\s*2px solid var\(--accent\)/);
});

test('the theme toggle names the current mode instead of contradicting itself', () => {
  // The label said "Dark mode" while aria-label said "Switch to light mode".
  assert.match(appSource, /data-theme-toggle role="switch" aria-checked="\$\{themeMode\(\) === 'dark'\}"/);
  assert.match(appSource, /aria-label="\$\{themeMode\(\) === 'dark' \? 'Dark mode' : 'Light mode'\}"/);
  // The title carries the action, so it must not repeat the label's wording.
  assert.match(appSource, /title="Switch to \$\{themeMode\(\) === 'dark' \? 'light' : 'dark'\} mode"/);
  assert.doesNotMatch(appSource, /button\.title = 'Switch theme'/);
});

test('path and address inputs have accessible names', () => {
  assert.match(appSource, /class="file-path-input" name="path"[^>]*aria-label="Folder path"/);
  assert.match(appSource, /class="file-path-input" name="url"[^>]*aria-label="Address or search"/);
});

test('icon-only controls keep their icon centred against the cascade', () => {
  // .tab resets justify-content and padding after .tab-add sets them, so the
  // higher-specificity rule has to claim both back or the + sits 3px left.
  const tabAdd = styles.slice(styles.indexOf('.tab.tab-add {'));
  const tabAddBody = tabAdd.slice(0, tabAdd.indexOf('}'));
  assert.match(tabAddBody, /justify-content:\s*center/);
  // Horizontal padding has to stay 0 or .tab's 9px left padding shifts the
  // icon. The vertical value is covered by the border-compensation test.
  assert.match(tabAddBody, /padding:\s*\d+px 0 0/);
  // These two override the 1px 6px UA button padding, which does not fit a
  // 14px icon inside a 20px box.
  for (const selector of ['.workspace-nav {', '.board-hscroll-arrow {']) {
    const rule = styles.slice(styles.indexOf(selector));
    assert.match(rule.slice(0, rule.indexOf('}')), /padding:\s*0/);
  }
});

test('a long workspace title truncates with an ellipsis like pane tabs do', () => {
  assert.match(appSource, /<span class="tab-label" data-rename-session=/);
  const rule = styles.slice(styles.indexOf('.tab-label {'));
  const body = rule.slice(0, rule.indexOf('}'));
  assert.match(body, /text-overflow:\s*ellipsis/);
  assert.match(body, /overflow:\s*hidden/);
  assert.match(body, /white-space:\s*nowrap/);
  // A flex child needs this or it refuses to shrink far enough to truncate.
  assert.match(body, /min-width:\s*0/);
});

test('user-facing copy stays in sentence case', () => {
  assert.match(appSource, /data-switch-mobile>Switch to mobile</);
  assert.doesNotMatch(appSource, /Switch to Mobile/);
});

test('top-level stacking uses tokens and keeps context menus above a focused pane', () => {
  const root = styles.slice(styles.indexOf(':root {'), styles.indexOf('* {'));
  const value = (name) => {
    const m = root.match(new RegExp('--z-' + name + ':\\s*(\\d+)'));
    assert.ok(m, 'missing token --z-' + name);
    return Number(m[1]);
  };
  const layers = ['sidebar', 'settings', 'modal', 'focus-backdrop', 'focus-pane', 'context-menu', 'toast'];
  const values = layers.map(value);
  for (let i = 1; i < values.length; i++) {
    assert.ok(values[i] > values[i - 1], `--z-${layers[i]} must sit above --z-${layers[i - 1]}`);
  }
  // The bug this replaced: both context menus shared 95 with the focus
  // backdrop, leaving them under the focused pane at 96.
  assert.match(styles, /\.file-context-menu\s*\{[^}]*z-index:\s*var\(--z-context-menu\)/);
  assert.match(styles, /\.terminal-context-menu\s*\{[^}]*z-index:\s*var\(--z-context-menu\)/);
  assert.match(styles, /\.pane-focus-backdrop\s*\{[^}]*z-index:\s*var\(--z-focus-backdrop\)/);
  assert.doesNotMatch(styles, /z-index:\s*9[56]\b/);
});

test('keyboard focus on pin and pane close is not styled as hover or pressed', () => {
  // All three states shared one rule with outline:none, so a keyboard ring was
  // indistinguishable from hovering, and from the pinned state.
  assert.match(styles, /\.sidebar-pin:focus-visible\s*\{[^}]*outline:\s*2px solid var\(--accent\)/);
  assert.match(styles, /\.pane-close:focus-visible,\s*\.pane-usage-refresh:focus-visible\s*\{[^}]*outline:\s*2px solid var\(--accent\)/);
  for (const selector of ['.sidebar-pin:hover', '.pane-close:hover']) {
    const idx = styles.indexOf(selector + ',\n');
    const rule = styles.slice(idx, styles.indexOf('}', idx));
    assert.doesNotMatch(rule, /:focus-visible/, `${selector} must not share its rule with :focus-visible`);
  }
});

test('the workspace add button centres its icon against the tab border', () => {
  // The tab carries its border on one edge only (bottom on desktop, top on
  // mobile), so the content box is 27px inside a 28px button and a centred
  // icon lands half a pixel off. Each side compensates in the opposite
  // direction; keep the two in step.
  const desktop = styles.slice(styles.indexOf('.tab.tab-add {'));
  assert.match(desktop.slice(0, desktop.indexOf('}')), /padding:\s*1px 0 0/);
  const mobile = styles.slice(styles.indexOf('.app.mode-mobile .tab.tab-add,'));
  assert.match(mobile.slice(0, mobile.indexOf('}')), /padding:\s*0 0 1px/);
  // An odd content box in the tab strip put the whole bar on a half pixel.
  const tabs = styles.slice(styles.indexOf('.tabs {\n  display: grid;'));
  assert.match(tabs.slice(0, tabs.indexOf('}')), /padding:\s*0 8px 3px/);
});

test('new-tab buttons match the close button they sit beside', () => {
  // The + had no height, so it collapsed to its 13px icon and its hover fill
  // read as a capsule next to the close button's 22px square.
  const rule = (selector) => {
    const start = styles.indexOf(selector + ' {');
    assert.ok(start !== -1, 'missing rule for ' + selector);
    return styles.slice(start, styles.indexOf('}', start));
  };
  // .pane-close shares its rule with .pane-usage-refresh, so match on the
  // selector that actually precedes the brace.
  const close = rule('.pane-usage-refresh');
  assert.match(close, /width:\s*22px/);
  assert.match(close, /height:\s*22px/);
  assert.match(close, /border-radius:\s*4px/);
  for (const selector of ['.pane-new-tab', '.browser-new-tab', '.notepad-new-tab']) {
    const body = rule(selector);
    assert.match(body, /width:\s*22px/, selector + ' width');
    assert.match(body, /height:\s*22px/, selector + ' height');
    assert.match(body, /border-radius:\s*4px/, selector + ' radius');
  }
  // The strip pads 2px top and 0 bottom, so centring alone leaves the + half a
  // pixel below the absolutely positioned close button.
  assert.match(rule('.pane-new-tab'), /margin-bottom:\s*1px/);
});

test('pane title rows follow one design per kind, and share a common base', () => {
  // Panes split in two: those with tabs (terminal, files, browser, notepad)
  // and those without (image, usage, whiteboard). Every pane inside a kind
  // must look identical, and both kinds share the row's height, background
  // and border. Browser had drifted to a 3px left pad; notepad to a 2px gap,
  // 58px tabs, 14px closes and an accent-tinted strip.
  const block = (selector) => {
    const start = styles.indexOf(selector + ' {');
    assert.ok(start !== -1, 'missing rule for ' + selector);
    return styles.slice(start, styles.indexOf('}', start));
  };
  const value = (selector, prop) => {
    const match = block(selector).match(new RegExp('(?:^|;|\\{)\\s*' + prop + '\\s*:\\s*([^;]+)'));
    return match ? match[1].trim() : '(unset)';
  };
  const groups = [
    [['.pane-tab-strip', '.browser-tab-strip', '.notepad-tab-strip'], ['height', 'gap', 'padding', 'color']],
    [['.pane-tab', '.browser-tab', '.notepad-tab'], ['height', 'gap', 'padding', 'min-width', 'max-width', 'grid-template-columns']],
    [['.pane-tab-close', '.browser-tab-close', '.notepad-tab-close'], ['width', 'height', 'border-radius', 'font-size']],
    [['.pane-new-tab', '.browser-new-tab', '.notepad-new-tab'], ['width', 'height', 'border-radius', 'flex']]
  ];
  for (const [selectors, props] of groups) {
    for (const prop of props) {
      const values = selectors.map((s) => value(s, prop));
      assert.equal(new Set(values).size, 1,
        `${prop} differs across pane types: ${selectors.map((s, i) => s + '=' + values[i]).join(', ')}`);
    }
  }

  // The icons inside those controls have to match too: comparing only the
  // buttons let browser keep a 14px glyph while the others drew 13px.
  for (const selector of ['.pane-new-tab', '.browser-new-tab', '.notepad-new-tab']) {
    assert.equal(styles.split(selector + ' .file-action-icon').length - 1, 1,
      selector + ' must use the shared icon rule, with no size override');
  }

  // Tabless panes all share .pane-title, so that kind is consistent by
  // construction. What has to hold is that both kinds sit on the same base:
  // a second .pane-title block supplies these, overriding an earlier one that
  // had no height and a hardcoded border colour.
  const tabless = styles.slice(styles.lastIndexOf('.pane-title {'));
  const tablessBody = tabless.slice(0, tabless.indexOf('}'));
  assert.match(tablessBody, /height:\s*var\(--pane-toolbar-height\)/);
  assert.match(tablessBody, /border-color:\s*var\(--line\)/);
  assert.match(tablessBody, /background:\s*color-mix\(in srgb, var\(--surface-soft\) 82%, var\(--terminal-bg\)\)/);
  const strip = styles.slice(styles.indexOf('.pane-tab-strip {'));
  const stripBody = strip.slice(0, strip.indexOf('}'));
  assert.match(stripBody, /height:\s*var\(--pane-toolbar-height\)/);
  assert.match(stripBody, /background:\s*color-mix\(in srgb, var\(--surface-soft\) 82%, var\(--terminal-bg\)\)/);
});

test('allowed hosts round-trips through the settings API and the Server section', () => {
  // The value leaves the server, reaches a field, and comes back on save; a
  // gap in any one of the five makes the setting silently read-only again.
  // updateConfigFile keeps its own per-section key list, and omitting it there
  // drops the write after both other layers have already accepted it.
  assert.match(mainSource, /allowed_hosts:\s*Array\.isArray\(config\.server\.allowed_hosts\)/);
  assert.match(mainSource, /next\.server\.allowed_hosts\s*=\s*updates\.server\.allowed_hosts/);
  assert.match(configSource, /server:\s*\['host', 'port', 'protocol', 'open_browser', 'allowed_hosts'\]/);
  assert.match(appSource, /<textarea name="server\.allowed_hosts"/);
  assert.match(appSource, /allowed_hosts:\s*lines\(form\.get\('server\.allowed_hosts'\)\)/);
});

// A cmd pane is a terminal pane that spawns cmd.exe, so it reuses the pane
// chrome, the tab strip and the shortcut toolbar rather than duplicating them.
test('the sidebar opens a cmd pane through the same terminal pane path', () => {
  assert.match(appSource, /data-action="new-cmd"[^>]+aria-label="New CMD pane"[^>]*>\s*<span class="rail-icon" aria-hidden="true">\$\{fileActionIcon\('cmd'\)\}<\/span><span class="rail-label">New CMD pane<\/span>/);
  assert.match(appSource, /\[data-action="new-cmd"\][^\n]+createPane\(null, 'cmd'\)/);
  assert.match(appSource, /body: JSON\.stringify\(\{ direction: 'auto', shell: shell \|\| 'powershell' \}\)/);
  // Only one terminal renderer exists, so the keybar and surfaces are shared.
  assert.equal(appSource.match(/renderMobileKeybar\(\)\}/g).length, 1);
  assert.match(i18nSource, /'New CMD pane': '新增 CMD 面板'/);
});

test('the sidebar opens an AI pane backed by its own manager and socket mode', () => {
  // Provider registration and the shared implementation both live in
  // plugin-panes, while the application keeps only the integration hooks.
  assert.doesNotMatch(appSource, /data-action="ai-(claude|codex)"/);
  assert.doesNotMatch(appSource, /async function openAiPane\(/);
  assert.match(appSource, /fileActionIcon\(pluginPane\.icon \|\| 'external'\)/);
  assert.match(mainSource, /app\.post\('\/api\/panes\/:paneId\/ai'/);
  assert.match(mainSource, /mode === 'ai'[\s\S]{0,300}?const manager = aiManagerForTab\(paneId\)[\s\S]{0,100}?manager\.attach\(paneId, ws\)/);
  assert.match(appSource, /mode=ai&token=/);
  assert.match(styles, /\.ai-surface\s*\{/);
  assert.match(i18nSource, /'New AI pane': '新增 AI 面板'/);
});

test('AI conversations keep a visible scrollbar and a readable line length', () => {
  assert.match(styles, /\.ai-surface\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\)/s);
  const scroll = styles.slice(styles.indexOf('.ai-scroll {'));
  const scrollBody = scroll.slice(0, scroll.indexOf('}'));
  assert.match(scrollBody, /overflow-y:\s*scroll/);
  assert.match(scrollBody, /scrollbar-gutter:\s*stable/);
  assert.match(scrollBody, /min-width:\s*0/);
  assert.match(styles, /\.ai-composer\s*\{[^}]*min-width:\s*0/s);
  assert.match(styles, /\.ai-surface\s*\{[^}]*--ai-reading-width:\s*720px/s);
  for (const selector of ['.ai-log', '.ai-toolbar', '.ai-commands', '.ai-input-row']) {
    assert.match(styles, new RegExp(`${selector.replace('.', '\\.')}\\s*\\{[^}]*max-width:\\s*var\\(--ai-reading-width\\)`, 's'));
  }
});

test('plugin pane manifests become isolated first-class panes', () => {
  assert.match(appSource, /pluginPanes:\s*\[\]/);
  assert.match(appSource, /data-plugin-pane-id="\$\{escapeAttr\(pluginPane\.id\)\}"/);
  assert.match(appSource, /pluginPaneLabel\(pluginPane\)/);
  assert.match(appSource, /openPluginPane\(button\.dataset\.pluginPaneId\)/);
  assert.match(appSource, /\/api\/panes\/\$\{basePaneId\}\/plugin/);
  assert.match(appSource, /class="plugin-pane-frame"[^>]*sandbox="allow-scripts allow-forms"/);
  assert.match(appSource, /pane\.type === 'plugin' \? renderPluginPane\(pane\)/);
  assert.match(styles, /\.plugin-pane-frame\s*\{[^}]*width:\s*100%[^}]*height:\s*100%[^}]*border:\s*0/s);
  assert.match(mainSource, /app\.get\('\/api\/plugin-panes'/);
  assert.match(mainSource, /app\.post\('\/api\/panes\/:paneId\/plugin'/);
});

test('Claude and Codex load independent implementations from their plugin folders', () => {
  assert.doesNotMatch(coreAppSource, /function renderAiSurface/);
  assert.doesNotMatch(coreStyles, /\.ai-surface/);
  for (const provider of ['claude', 'codex']) {
    assert.doesNotMatch(indexSource, new RegExp(`/plugin-panes/${provider}/`));
    assert.doesNotMatch(mainSource, new RegExp(`plugin-panes/${provider}/server`));
  }
  assert.match(coreAppSource, /loadAiPanePlugins\(state\.pluginPanes\)/);
  assert.match(coreAppSource, /definition\.clientUrl/);
  assert.match(coreAppSource, /definition\.styleUrl/);
  assert.match(aiClientSource, /Wps7AiPanePlugins\.claude/);
  assert.match(codexClientSource, /Wps7AiPanePlugins\.codex/);
  assert.match(mainSource, /loadAiPluginPanes\(root\)/);
});

// An AI pane holds one conversation per tab, so it reuses the terminal pane's
// tab strip rather than growing a second tab implementation.
test('AI panes reuse the shared pane tab strip and its routes', () => {
  assert.match(appSource, /function paneTabKind\(pane\)[\s\S]{0,200}?pane\.type === 'ai'\) return 'ai'/);
  assert.match(appSource, /function paneTabs\(pane\)[\s\S]{0,200}?pane\.type === 'ai'\) return pane\.aiTabs/);
  assert.match(appSource, /activePaneTabId[\s\S]{0,300}?pane\.activeAiTabId/);
  assert.match(appSource, /function sidebarPaneTabs\(pane\)[\s\S]{0,160}?pane\.type === 'ai'/);
  for (const route of ['tabs', 'tabs/:tabId/activate', 'tabs/:tabId']) {
    assert.match(mainSource, new RegExp(`/api/panes/:paneId/ai/${route.replace(/\//g, '\\/')}'`));
  }
  // The pane title chain is untouched: an AI pane falls through to the strip.
  assert.doesNotMatch(appSource, /pane\.type === 'ai'[^\n]*data-pane-title/);
});

// Both wiring entry points have to know about the pane, or a freshly created
// one has no listeners until the next full render.
test('AI panes are wired on first render and when added incrementally', () => {
  assert.match(coreAppSource, /aiPane\.wire\(app\);/);
  assert.match(coreAppSource, /aiPane\.wire\(paneElement\);/);
  assert.match(coreAppSource, /aiPane\.disposeAll\(\);/);
  assert.match(aiClientSource, /aiConnections\.get\(tabId\)\?\.dispose\(\)/);
});

// The transcript is the user's and the agent's own words; running the UI phrase
// dictionary over it would rewrite them.
test('the conversation is excluded from automatic UI translation', () => {
  assert.match(i18nSource, /function shouldSkip\(node\)[\s\S]{0,200}?\.ai-log/);
  assert.match(appSource, /function aiText\(value\)[\s\S]{0,120}?Wps7I18n\?\.t\(value\)/);
});

// Markdown is rendered after escaping, never before, and tool output is never
// treated as markup at all.
test('agent markdown is escaped before it is formatted', () => {
  assert.match(appSource, /function renderMarkdown\(value\)[\s\S]{0,200}?escapeHtml\(String\(value \|\| ''\)\)/);
  assert.match(appSource, /kind === 'tool_use' \? event\.tool\?\.input : event\.result\?\.output[\s\S]{0,300}?<code>\$\{escapeHtml\(body/);
  // No dependency was added for this: the CSP forbids remote script anyway, so
  // a renderer would have to be vendored and licence-tracked as well.
  const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));
  for (const name of Object.keys(manifest.dependencies)) {
    assert.doesNotMatch(name, /^(marked|markdown-it|remark|dompurify)$/i);
  }
});

// renderMarkdown only needs the two escape helpers, so it can run outside a
// browser the same way the terminal copy helpers do.
function loadRenderMarkdown() {
  const start = aiClientSource.indexOf('    function renderMarkdown(value) {');
  const end = aiClientSource.indexOf('    // The transcript is excluded');
  assert.ok(start >= 0 && end > start, 'renderMarkdown not found in the AI pane client');
  const escapeHtml = (value) => String(value)
    .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;').replaceAll("'", '&#039;');
  const context = vm.createContext({ escapeHtml, escapeAttr: (value) => escapeHtml(value ?? '') });
  vm.runInContext(aiClientSource.slice(start, end), context);
  return context.renderMarkdown;
}

test('the transcript renders the Markdown an agent commonly writes', () => {
  const renderMarkdown = loadRenderMarkdown();

  assert.equal(renderMarkdown('# One'), '<h3 class="ai-heading">One</h3>');
  assert.equal(renderMarkdown('## Two'), '<h4 class="ai-heading">Two</h4>');
  assert.equal(renderMarkdown('### Three'), '<h5 class="ai-heading">Three</h5>');
  assert.equal(renderMarkdown('#### Four'), '<h6 class="ai-heading">Four</h6>');
  assert.equal(renderMarkdown('---'), '<hr class="ai-rule">');
  assert.equal(renderMarkdown('***'), '<hr class="ai-rule">');

  // A heading needs no blank line after it, which is how agents usually write.
  assert.equal(
    renderMarkdown('## Plan\nFirst we look.'),
    '<h4 class="ai-heading">Plan</h4><p>First we look.</p>'
  );

  const table = renderMarkdown('| Item | Count |\n| --- | ---: |\n| alpha | 12 |');
  assert.match(table, /<div class="ai-table-wrap"><table class="ai-table">/);
  assert.match(table, /<th>Item<\/th><th class="ai-align-right">Count<\/th>/);
  assert.match(table, /<td>alpha<\/td><td class="ai-align-right">12<\/td>/);

  assert.equal(renderMarkdown('> note'), '<blockquote class="ai-quote">note</blockquote>');
  assert.equal(renderMarkdown('- a\n- b'), '<ul><li>a</li><li>b</li></ul>');
  assert.equal(renderMarkdown('1. a\n2. b'), '<ol><li>a</li><li>b</li></ol>');

  // A bar in prose is not a table, and a rule inside fenced code is still code.
  assert.equal(renderMarkdown('a | b'), '<p>a | b</p>');
  assert.match(renderMarkdown('```\n---\n```'), /^<pre class="ai-code"><code>---<\/code><\/pre>$/);
});

test('Markdown structure cannot smuggle markup into the transcript', () => {
  const renderMarkdown = loadRenderMarkdown();
  const table = renderMarkdown('| <img src=x onerror=alert(1)> |\n| --- |\n| <b>no</b> |');
  assert.doesNotMatch(table, /<img|<b>/);
  assert.match(table, /&lt;img src=x onerror=alert\(1\)&gt;/);
  assert.doesNotMatch(renderMarkdown('> <script>alert(1)</script>'), /<script/);
  assert.doesNotMatch(renderMarkdown('# <script>alert(1)</script>'), /<script/);
});

test('the transcript links URLs an agent writes, in both Markdown and bare form', () => {
  const renderMarkdown = loadRenderMarkdown();
  const href = (html) => (/href="([^"]*)"/.exec(html) || [])[1];

  assert.equal(
    renderMarkdown('[the docs](https://example.com/guide)'),
    '<p><a class="ai-link" href="https://example.com/guide" target="_blank" rel="noopener noreferrer">the docs</a></p>'
  );
  assert.equal(href(renderMarkdown('see https://example.com/a')), 'https://example.com/a');
  assert.equal(href(renderMarkdown('[me](mailto:a@b.com)')), 'mailto:a@b.com');
  // A query string keeps its separator escaped, which is what an href needs.
  assert.equal(href(renderMarkdown('https://example.com/?x=1&y=2')), 'https://example.com/?x=1&amp;y=2');
  // Neighbouring punctuation and quotes belong to the sentence, not the URL.
  assert.equal(href(renderMarkdown('go to https://example.com/b.')), 'https://example.com/b');
  assert.equal(href(renderMarkdown('"https://example.com/c"')), 'https://example.com/c');

  // Links work wherever prose does.
  assert.match(renderMarkdown('| [docs](https://example.com) |\n| --- |\n| ok |'), /<th><a class="ai-link"/);
  assert.match(renderMarkdown('- [one](https://example.com)'), /<li><a class="ai-link"/);
  // A URL inside a code span is quoted output, not a link.
  assert.equal(renderMarkdown('`https://example.com`'), '<p><code>https://example.com</code></p>');
});

test('only http, https and mailto URLs become clickable', () => {
  const renderMarkdown = loadRenderMarkdown();
  for (const url of ['javascript:alert(1)', 'data:text/html,x', 'vbscript:x', 'file:///C:/secret', '/etc/passwd']) {
    const html = renderMarkdown(`[label](${url})`);
    assert.doesNotMatch(html, /<a /, `${url} should not be a link`);
  }
  // Every link that is made leaves the app safely.
  const html = renderMarkdown('[x](https://example.com)');
  assert.match(html, /target="_blank"/);
  assert.match(html, /rel="noopener noreferrer"/);
});

test('the transcript styles the Markdown blocks it can emit', () => {
  for (const selector of ['.ai-log .ai-rule', '.ai-log .ai-quote', '.ai-log .ai-table-wrap', '.ai-log .ai-table th', '.ai-log .ai-table .ai-align-right', '.ai-log .ai-link']) {
    assert.ok(aiStyles.includes(`${selector} {`) || aiStyles.includes(`${selector},`), `${selector} is unstyled`);
  }
  // Heading depth has to be visible, not just semantic.
  assert.match(aiStyles, /h3\.ai-heading \{[^}]*font-size/);
  assert.match(aiStyles, /h4\.ai-heading \{[^}]*font-size/);
});

test('AI defaults are configurable and reach the settings form', () => {
  const section = settingsSection('settings-ai');
  for (const key of ['default_provider', 'show_thinking', 'show_tools', 'claude_model', 'claude_args', 'codex_args', 'debug_log']) {
    assert.match(section, new RegExp(`name="ai\\.${key}"`));
    assert.match(appSource, new RegExp(`${key}: `));
  }
  assert.match(configSource, /claude_args: '--dangerously-skip-permissions'/);
  assert.match(configSource, /codex_args: '--yolo'/);
  // Shell metacharacters cannot be stored as CLI arguments.
  assert.match(mainSource, /parseCliArgs\(value\)/);
  assert.match(mainSource, /Invalid \$\{key\.replace/);
});


// The folder an agent runs in is the thing you check before letting it touch
// files, so it lives in the toolbar rather than behind a settings page.
test('an AI tab shows the folder it runs in and can be pointed somewhere else', () => {
  assert.match(appSource, /data-ai-folder/);
  assert.match(appSource, /function aiFolderLabel\(cwd\)/);
  assert.match(appSource, /function openFolderDialog\(/);
  assert.match(appSource, /async function changeAiFolder\(surface\)/);
  assert.match(appSource, /JSON\.stringify\(\{ cwd: chosen \}\)/);
  assert.match(styles, /\.folder-picker-list \{/);
  assert.match(styles, /\.ai-folder \{/);
  // The picker browses with the endpoints the file pane already exposes,
  // rather than adding a second way to list folders.
  const picker = appSource.slice(appSource.indexOf('function openFolderDialog'), appSource.indexOf('async function changeAiFolder'));
  assert.ok(picker.includes('/api/files/drives'), 'the picker should list drives');
  assert.ok(picker.includes('/api/files?path='), 'the picker should list folders');
  // Typing a path while a listing is still in flight must not be overwritten
  // when that listing arrives.
  assert.ok(picker.includes('pathInput.value === typedBefore'), 'the picker must not clobber typing');
  assert.ok(picker.includes('request !== loadToken'), 'a stale listing must not win');
  assert.match(i18nSource, /'Working folder': '工作資料夾'/);
});

// Changing it has to relaunch the CLI: the working directory is fixed when the
// process is spawned.
test('changing the folder restarts the CLI in it', () => {
  assert.match(mainSource, /function aiWorkingFolder\(value\)/);
  assert.match(mainSource, /isDirectory\(\)/);
  assert.match(mainSource, /aiManagerForTab\(req\.params\.tabId\)\?\.restartTab\(req\.params\.tabId/);
  assert.match(aiSource, /restartTab\(tabId, notice\)/);
  // A folder that is not there is refused rather than silently ignored.
  assert.match(mainSource, /That folder does not exist on this machine\./);
});


// AskUserQuestion always offers "Other" and never lists it, so the pane has to
// supply it or the user cannot answer in their own words.
test('an agent question offers a typed answer alongside its listed options', () => {
  assert.match(appSource, /data-ai-other/);
  assert.match(appSource, /data-ai-other-input/);
  assert.match(appSource, /question\.allowFreeText && !answered/);
  // The typed text travels as text, not as a fake option id.
  assert.match(appSource, /sendAnswer\(input, \{ text: input\.value\.trim\(\) \}\)/);
  assert.match(aiSource, /allowFreeText: true/);
  assert.match(styles, /\.ai-other-input \{/);
  assert.match(i18nSource, /'Other': '其他'/);
});

// A crashed CLI used to leave the pane reading "Stopped" with nothing to press.
test('a stopped AI tab offers a retry', () => {
  assert.match(appSource, /data-ai-retry/);
  assert.match(appSource, /retry\.hidden = status !== 'stopped'/);
  assert.match(appSource, /send\(\{ type: 'restart' \}\)/);
  assert.match(styles, /\.ai-retry \{/);
  assert.match(i18nSource, /'Retry': '重試'/);
});


// The automatic DOM translation only reaches elements added to the page, so a
// label written with textContent stays in English unless it translates itself.
// The status line is the one the user sees most.
test('the AI status line is translated like the rest of the pane', () => {
  const wording = appSource.slice(appSource.indexOf('const wording = {'), appSource.indexOf('const wording = {') + 220);
  assert.match(wording, /aiText\('Working…'\)/);
  assert.match(wording, /aiText\('Waiting for you'\)/);
  assert.match(wording, /aiText\('Stopped'\)/);
  assert.match(i18nSource, /'Stopped': '已停止'/);
  assert.match(i18nSource, /'Waiting for you': '等待你的選擇'/);
});

test('an AI tab keeps its current model and reasoning visible', () => {
  assert.match(appSource, /data-ai-runtime/);
  assert.match(appSource, /function setAiRuntime\(tabId, model, effort\)/);
  assert.match(appSource, /setAiRuntime\(tabId, message\.model, message\.effort\)/);
  assert.match(styles, /\.ai-runtime \{/);
});

test('the model/effort and working folder sit in their own row under the title, and the bottom toolbar keeps the rest', () => {
  const surface = appSource.slice(appSource.indexOf('function renderAiSurface'), appSource.indexOf('function renderMarkdown'));
  const surfaceStyles = styles.slice(styles.indexOf('.ai-surface {'), styles.indexOf('.ai-surface[hidden]'));
  assert.match(surface, /ai-meta[\s\S]*data-ai-runtime[\s\S]*data-ai-folder[\s\S]*ai-scroll[\s\S]*ai-toolbar[\s\S]*data-ai-toggle="thinking"[\s\S]*data-ai-toggle="tools"[\s\S]*data-ai-sessions/);
  assert.doesNotMatch(surface, /ai-context-toolbar/);
  assert.match(surfaceStyles, /grid-template-rows: auto minmax\(0, 1fr\) auto/);
  assert.match(surface, /data-ai-provider="\$\{provider\}"/);
  assert.doesNotMatch(styles, /\.ai-context-toolbar \{/);
  assert.match(surface, /data-ai-input[^>]+aria-label=/);
  assert.match(i18nSource, /'Message': '訊息'/);
});

test('thinking and tool visibility use persistent icon toggles', () => {
  const surface = appSource.slice(appSource.indexOf('function renderAiSurface'), appSource.indexOf('function renderMarkdown'));
  assert.match(surface, /data-ai-toggle="thinking"[^>]*aria-label=[^>]*>[\s\S]*fileActionIcon\('thinking'\)/);
  assert.match(surface, /data-ai-toggle="tools"[^>]*aria-label=[^>]*>[\s\S]*fileActionIcon\('tools'\)/);
  assert.doesNotMatch(surface, /data-ai-toggle="thinking"[^>]*hidden/);
  assert.doesNotMatch(appSource, /function syncAiThinkingToggle\(surface\)/);
});


// A reply's tokens arrive as its own 'event' (streaming: true) followed by
// 'patch' messages that grow the same bubble; only a reply with no streaming
// flag (history replay, or a turn that never sent deltas) gets the fake
// typewriter reveal.
test('a streaming reply grows in place instead of animating after the fact', () => {
  assert.match(appSource, /function appendAiEvent\(tabId, event, streaming\)/);
  assert.match(appSource, /if \(streaming\) \{[\s\S]{0,200}?bubble\.textContent = event\.text/);
  assert.match(appSource, /appendAiEvent\(tabId, message\.event, message\.streaming\)/);

  assert.match(appSource, /function patchAiEvent\(tabId, id, patch\)/);
  assert.match(appSource, /if \(patch\.text !== undefined\)[\s\S]{0,300}?renderMarkdown\(patch\.text\)/);
  assert.match(appSource, /patchAiEvent\(tabId, message\.id, message\)/);
});

// Typing a slash used to offer nothing, so a terminal-only command like /plan
// was sent as text and came back as "that is not available in this
// environment", which reads as the whole feature being broken.
test('the composer offers the slash commands the CLI can dispatch', () => {
  assert.match(appSource, /function updateAiCommandMenu\(surface\)/);
  assert.match(appSource, /state\.aiCommands/);
  assert.match(appSource, /data-ai-commands/);
  assert.match(appSource, /data-ai-command=/);
  // Completing a choice leaves room for arguments rather than submitting it.
  assert.match(appSource, /input\.value = chosen\.dataset\.aiCompletion/);
  assert.match(styles, /\.ai-command \{/);
  assert.match(i18nSource, /'Commands': '指令'/);
});

test('the codex composer completes dynamic command arguments and skills', () => {
  assert.match(appSource, /state\.aiCapabilities/);
  assert.match(appSource, /message\.type === 'capabilities'/);
  assert.match(appSource, /capabilities\.models/);
  assert.match(appSource, /capabilities\.skills/);
  assert.match(appSource, /capabilities\.collaborationModes/);
  assert.match(appSource, /\$\(\[\\w:-\]\*\)\$/);
  assert.match(appSource, /data-ai-completion=/);
  assert.match(styles, /\.ai-command-description \{/);
});

test('completing a slash command immediately opens its argument choices', () => {
  const takeChoice = appSource.slice(appSource.indexOf('function takeAiCommandChoice'), appSource.indexOf('async function openAiSessions'));
  assert.match(takeChoice, /input\.value = chosen\.dataset\.aiCompletion/);
  assert.match(takeChoice, /updateAiCommandMenu\(surface\)/);
});

test('a command the CLI cannot dispatch is called out before it is sent', () => {
  assert.match(appSource, /ai-command-note/);
  assert.match(appSource, /is not a command here, and will be sent as plain text/);
  assert.match(i18nSource, /在這裡不是指令/);
});

// The list comes from the CLI, and the terminal-only entries are dropped.
test('the AI pane takes its command list from the CLI', () => {
  assert.match(aiSource, /terminal_slash_commands/);
  assert.match(aiSource, /slash_commands/);
  assert.match(aiSource, /type: 'commands'/);
  assert.match(aiSource, /commands: runtime\.commands/);
});


// A conversation the pane has forgotten is still in the CLI, and both CLIs
// take an id to continue one, so the tab can be pointed back at it.
test('an AI tab can be pointed back at an earlier conversation', () => {
  assert.match(appSource, /data-ai-sessions/);
  assert.match(appSource, /async function openAiSessions\(surface\)/);
  assert.match(appSource, /function pickAiSession\(sessions/);
  assert.match(mainSource, /'\/api\/panes\/:paneId\/ai\/tabs\/:tabId\/sessions'/);
  assert.match(mainSource, /'\/api\/panes\/:paneId\/ai\/tabs\/:tabId\/session'/);
  assert.match(aiSource, /resumeSession\(paneId, tabId, sessionId, label\)/);
  assert.match(styles, /\.ai-session-list \{/);
  assert.match(i18nSource, /'Earlier conversations': '較早的對話'/);
});

// The messages on screen belong to the conversation being left behind.
test('resuming says the earlier messages live in the CLI, not the pane', () => {
  assert.match(aiSource, /Now continuing an earlier conversation/);
  assert.match(appSource, /The agent keeps these messages/);
  assert.match(i18nSource, /AI 仍然記得這些訊息/);
});


// The list used to appear only after the first reply, and then showed eight
// entries out of sixty-five with nothing to say the rest existed.
test('the command menu is complete and available before the first reply', () => {
  const menu = appSource.slice(appSource.indexOf('function updateAiCommandMenu'),
    appSource.indexOf('function moveAiCommandChoice'));
  // Every match is rendered; the box scrolls instead.
  assert.doesNotMatch(menu, /slice\(0, 8\)/);
  assert.match(menu, /commands\.filter/);
  assert.match(menu, /command\.argumentHint/);
  assert.match(menu, /command\.description/);
  // Asked for up front rather than waiting for the init frame.
  assert.match(aiSource, /subtype: 'initialize'/);
  assert.match(aiSource, /handleControlResponse\(message\)/);
  assert.match(styles, /\.ai-command-args \{/);
  assert.match(styles, /\.ai-command-about \{/);
});


// claude takes several seconds to answer with its list, so an empty menu had
// to be told apart from a CLI that simply has no commands.
test('the command menu says when the list has not arrived yet', () => {
  assert.match(appSource, /Loading commands…/);
  assert.match(appSource, /known\.ready/);
  assert.match(aiSource, /commandsReady/);
  assert.match(i18nSource, /'Loading commands…': '正在載入指令…'/);
});

// The answer is the same for every tab, so the first one pays for all of them,
// and a list that lands while the menu is open redraws it.
test('a command list is cached and redraws an open menu', () => {
  assert.match(aiSource, /commandCache/);
  assert.match(aiSource, /commandCache\.set/);
  const branch = appSource.slice(appSource.indexOf("if (message.type === 'commands')"),
    appSource.indexOf("if (message.type === 'commands')") + 400);
  assert.match(branch, /updateAiCommandMenu\(surface\)/);
});

// /reasoning used to autocomplete with the union of every known model's
// levels (e.g. offering "max"/"ultra" from one model while another was
// selected), so picking one the active model does not support made the CLI
// reject it with a "Usage: /reasoning <...>" error.
test('the /reasoning autocomplete only offers levels the active model supports', () => {
  const branch = appSource.slice(appSource.indexOf("if (command === 'reasoning')"),
    appSource.indexOf("if (command === 'personality')"));
  assert.doesNotMatch(branch, /flatMap/);
  assert.match(branch, /capabilities\.currentModel/);
  // The backend must publish which model is active alongside the catalog,
  // or the frontend has nothing to match against.
  assert.match(aiSource, /currentModel:\s*runtime\.model/);
});
