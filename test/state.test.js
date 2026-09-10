const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { StateStore } = require('../src/state');

// Terminal output is never collected here any more: the headless terminal the
// server keeps per runtime is what a reconnecting client replays from.
test('the store holds no terminal output at all', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wps7-state-'));
  const store = new StateStore(root);
  store.load();
  const paneId = store.state.sessions[0].tabs[0].panes[0].id;

  assert.equal(typeof store.appendScrollback, 'undefined');
  assert.equal(typeof store.clearScrollback, 'undefined');
  assert.equal(store.findPane(paneId).pane.scrollback, undefined);
  assert.equal(store.getPublicState().sessions[0].tabs[0].panes[0].scrollback, undefined);
});

test('saved state keeps layout only', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wps7-state-'));
  const store = new StateStore(root);
  store.load();
  const paneId = store.state.sessions[0].tabs[0].panes[0].id;

  store.findPane(paneId).pane.lastProgram = 'codex';
  store.save();

  const saved = JSON.parse(fs.readFileSync(path.join(root, 'data', 'state.json'), 'utf8'));
  const savedPane = saved.sessions[0].tabs[0].panes[0];
  assert.equal(savedPane.title, 'PowerShell 1');
  assert.equal(savedPane.scrollback, undefined);
  assert.equal(savedPane.lastProgram, undefined);
  assert.deepEqual(savedPane.layout, { x: 0, y: 0, w: 6, h: 12 });
});

test('pane font size is validated and persisted per pane', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wps7-state-'));
  const store = new StateStore(root);
  store.load();
  const paneId = store.state.sessions[0].tabs[0].panes[0].id;

  assert.equal(store.setPaneFontSize(paneId, 18), true);
  assert.equal(store.findPane(paneId).pane.fontSize, 18);
  assert.equal(store.setPaneFontSize(paneId, 40), false);

  const reloaded = new StateStore(root);
  reloaded.load();
  assert.equal(reloaded.findPane(paneId).pane.fontSize, 18);
  assert.equal(reloaded.getPublicState().sessions[0].tabs[0].panes[0].fontSize, 18);
});

test('loading old state strips non-layout terminal data', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wps7-state-'));
  const dataDir = path.join(root, 'data');
  fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(path.join(dataDir, 'state.json'), JSON.stringify({
    activeSessionId: 'session-1',
    updatedAt: new Date().toISOString(),
    sessions: [{
      id: 'session-1',
      name: 'Session 1',
      activePaneId: 'pane-1',
      tabs: [{
        id: 'tab-1',
        name: 'Main',
        activePaneId: 'pane-1',
        panes: [{
          id: 'pane-1',
          title: 'PowerShell',
          cwd: root,
          split: null,
          lastProgram: 'codex',
          scrollback: ['old output']
        }]
      }]
    }]
  }));

  const store = new StateStore(root);
  store.load();
  const pane = store.findPane('pane-1').pane;
  // A state.json written before terminal output stopped being collected still
  // carries it; hydration drops it instead of loading it back into memory.
  assert.equal(pane.scrollback, undefined);
  assert.equal(pane.lastProgram, undefined);
  assert.deepEqual(pane.layout, { x: 0, y: 0, w: 6, h: 12 });
});

test('new sessions and panes use unique default names', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wps7-state-'));
  const store = new StateStore(root);
  store.load();

  const secondSession = store.createSession();
  const thirdSession = store.createSession();
  assert.equal(secondSession.name, 'Workspace 2');
  assert.equal(thirdSession.name, 'Workspace 3');

  const paneId = thirdSession.tabs[0].panes[0].id;
  const secondPane = store.splitPane(paneId, 'horizontal');
  const thirdPane = store.splitPane(secondPane.id, 'vertical');
  assert.equal(secondPane.title, 'PowerShell 2');
  assert.equal(thirdPane.title, 'PowerShell 3');
  assert.deepEqual(secondPane.layout, { x: 6, y: 0, w: 6, h: 12 });
  assert.deepEqual(thirdPane.layout, { x: 12, y: 0, w: 6, h: 12 });
});

// Dragging a workspace title to a new slot in the strip.
test('moveSession reorders the workspaces and keeps the index in range', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wps7-state-'));
  const store = new StateStore(root);
  store.load();
  store.createSession();
  store.createSession();
  const names = () => store.state.sessions.map((session) => session.name);
  const idOf = (name) => store.state.sessions.find((session) => session.name === name).id;

  assert.deepEqual(names(), ['Workspace 1', 'Workspace 2', 'Workspace 3']);

  // The last workspace dragged to the front, then back to the end.
  assert.equal(store.moveSession(idOf('Workspace 3'), 0), true);
  assert.deepEqual(names(), ['Workspace 3', 'Workspace 1', 'Workspace 2']);
  assert.equal(store.moveSession(idOf('Workspace 3'), 2), true);
  assert.deepEqual(names(), ['Workspace 1', 'Workspace 2', 'Workspace 3']);

  // Dropping past either end lands on it rather than falling out of the list.
  assert.equal(store.moveSession(idOf('Workspace 2'), 99), true);
  assert.deepEqual(names(), ['Workspace 1', 'Workspace 3', 'Workspace 2']);
  assert.equal(store.moveSession(idOf('Workspace 2'), -5), true);
  assert.deepEqual(names(), ['Workspace 2', 'Workspace 1', 'Workspace 3']);

  // A no-op move still succeeds; an unknown workspace or index does not.
  assert.equal(store.moveSession(idOf('Workspace 2'), 0), true);
  assert.equal(store.moveSession('missing', 0), false);
  assert.equal(store.moveSession(idOf('Workspace 2'), 'left'), false);
  assert.deepEqual(names(), ['Workspace 2', 'Workspace 1', 'Workspace 3']);

  // The new order survives a reload.
  const reopened = new StateStore(root);
  reopened.load();
  assert.deepEqual(reopened.state.sessions.map((session) => session.name), ['Workspace 2', 'Workspace 1', 'Workspace 3']);
});

test('placePane refuses a position that would overlap another pane', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wps7-state-'));
  const store = new StateStore(root);
  store.load();
  const paneId = store.state.sessions[0].tabs[0].panes[0].id;
  const secondPane = store.splitPane(paneId, 'horizontal');

  assert.deepEqual(secondPane.layout, { x: 6, y: 0, w: 6, h: 12 });

  // panes share one plane: an overlapping move is rejected and nothing changes
  assert.equal(store.placePane(secondPane.id, { x: 3, y: 4, w: 4, h: 8 }), false);
  assert.deepEqual(store.findPane(secondPane.id).pane.layout, { x: 6, y: 0, w: 6, h: 12 });

  // touching edges is not overlapping
  assert.equal(store.placePane(secondPane.id, { x: 6, y: 0, w: 3, h: 6 }), true);
  assert.equal(store.placePane(paneId, { x: 0, y: 0, w: 6, h: 12 }), true);
  // and the freed space is now available
  assert.equal(store.placePane(secondPane.id, { x: 6, y: 6, w: 6, h: 6 }), true);
  assert.deepEqual(store.findPane(secondPane.id).pane.layout, { x: 6, y: 6, w: 6, h: 6 });

  const reloaded = new StateStore(root);
  reloaded.load();
  assert.deepEqual(reloaded.findPane(secondPane.id).pane.layout, { x: 6, y: 6, w: 6, h: 6 });
});

test('overlaps left by older layouts are pushed apart on load', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wps7-state-'));
  const dataDir = path.join(root, 'data');
  fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(path.join(dataDir, 'state.json'), JSON.stringify({
    activeSessionId: 'session-1',
    updatedAt: new Date().toISOString(),
    sessions: [{
      id: 'session-1',
      name: 'Session 1',
      activePaneId: 'pane-1',
      tabs: [{
        id: 'tab-1',
        name: 'Main',
        activePaneId: 'pane-1',
        panes: [
          { id: 'pane-1', title: 'A', cwd: root, split: null, layout: { x: 0, y: 0, w: 6, h: 12 } },
          { id: 'pane-2', title: 'B', cwd: root, split: null, layout: { x: 3, y: 0, w: 6, h: 12 } }
        ]
      }]
    }]
  }));

  const store = new StateStore(root);
  store.load();
  const layouts = store.state.sessions[0].tabs[0].panes.map((pane) => pane.layout);
  // the leftmost pane keeps its place; the other slides right until it is clear
  assert.deepEqual(layouts[0], { x: 0, y: 0, w: 6, h: 12 });
  assert.deepEqual(layouts[1], { x: 6, y: 0, w: 6, h: 12 });
});

test('changing vertical slots rescales every pane and keeps them apart', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wps7-state-'));
  const store = new StateStore(root, { verticalSlots: 12 });
  store.load();
  const tab = store.state.sessions[0].tabs[0];
  const first = tab.panes[0].id;
  const second = store.splitPane(first, 'horizontal').id;
  assert.equal(store.placePane(first, { x: 0, y: 0, w: 6, h: 6 }), true);
  assert.equal(store.placePane(second, { x: 0, y: 6, w: 6, h: 6 }), true);

  // halving the slot count halves every pane's height and offset
  assert.equal(store.applyGrid(120, 6), true);
  assert.deepEqual(store.findPane(first).pane.layout, { x: 0, y: 0, w: 6, h: 3 });
  assert.deepEqual(store.findPane(second).pane.layout, { x: 0, y: 3, w: 6, h: 3 });

  // cell width alone changes no cell counts
  assert.equal(store.applyGrid(60, 6), false);
  assert.deepEqual(store.findPane(second).pane.layout, { x: 0, y: 3, w: 6, h: 3 });
  assert.equal(store.gridSize, 60);
});

test('a configured default pane width sizes the first pane and every new pane', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wps7-state-'));
  const store = new StateStore(root, { defaultPaneWidth: 4 });
  store.load();
  const firstPane = store.state.sessions[0].tabs[0].panes[0];
  assert.deepEqual(firstPane.layout, { x: 0, y: 0, w: 4, h: 12 });

  const secondPane = store.splitPane(firstPane.id, 'horizontal');
  assert.deepEqual(secondPane.layout, { x: 4, y: 0, w: 4, h: 12 });

  const thirdPane = store.createFilesPane(secondPane.id, 'C:\\');
  assert.deepEqual(thirdPane.layout, { x: 8, y: 0, w: 4, h: 12 });

  const session = store.createSession();
  assert.deepEqual(session.tabs[0].panes[0].layout, { x: 0, y: 0, w: 4, h: 12 });
});

test('out-of-range default pane widths clamp instead of breaking the board', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wps7-state-'));
  const store = new StateStore(root, { defaultPaneWidth: 0 });
  store.load();
  assert.deepEqual(store.state.sessions[0].tabs[0].panes[0].layout, { x: 0, y: 0, w: 1, h: 12 });
});

test('a configured default pane height sizes the first pane and every new pane', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wps7-state-'));
  const store = new StateStore(root, { verticalSlots: 12, defaultPaneHeight: 4 });
  store.load();
  const firstPane = store.state.sessions[0].tabs[0].panes[0];
  assert.deepEqual(firstPane.layout, { x: 0, y: 0, w: 6, h: 4 });

  // Panes shorter than the board leave room underneath, and that room is to the
  // left of anything a new column would open, so it gets filled first.
  const secondPane = store.splitPane(firstPane.id, 'horizontal');
  assert.deepEqual(secondPane.layout, { x: 0, y: 4, w: 6, h: 4 });

  const thirdPane = store.createFilesPane(secondPane.id, 'C:\\');
  assert.deepEqual(thirdPane.layout, { x: 0, y: 8, w: 6, h: 4 });

  const session = store.createSession();
  assert.deepEqual(session.tabs[0].panes[0].layout, { x: 0, y: 0, w: 6, h: 4 });
});

test('a default pane height above rows per screen clamps to the row count', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wps7-state-'));
  const store = new StateStore(root, { verticalSlots: 8, defaultPaneHeight: 99 });
  store.load();
  assert.equal(store.defaultPaneHeight, 8);
  assert.deepEqual(store.state.sessions[0].tabs[0].panes[0].layout, { x: 0, y: 0, w: 6, h: 8 });
});

test('applyGrid re-clamps the default pane height when rows per screen shrinks', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wps7-state-'));
  const store = new StateStore(root, { verticalSlots: 12, defaultPaneHeight: 10 });
  store.load();

  store.applyGrid(store.gridSize, 6, store.defaultPaneWidth, 10);
  assert.equal(store.defaultPaneHeight, 6);
});

test('applyGrid updates the default pane width without resizing existing panes', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wps7-state-'));
  const store = new StateStore(root, { defaultPaneWidth: 6 });
  store.load();
  const firstPane = store.state.sessions[0].tabs[0].panes[0];

  store.applyGrid(store.gridSize, store.verticalSlots, 3);
  assert.equal(store.defaultPaneWidth, 3);
  assert.deepEqual(firstPane.layout, { x: 0, y: 0, w: 6, h: 12 });

  const nextPane = store.splitPane(firstPane.id, 'horizontal');
  assert.deepEqual(nextPane.layout, { x: 6, y: 0, w: 3, h: 12 });
});

test('new panes open past the rightmost edge at full height', () => {
  for (const type of ['terminal', 'files']) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wps7-state-'));
    const store = new StateStore(root);
    store.load();
    const firstPane = store.state.sessions[0].tabs[0].panes[0];
    const firstLayout = { ...firstPane.layout };

    const newPane = type === 'terminal'
      ? store.splitPane(firstPane.id, 'horizontal')
      : store.createFilesPane(firstPane.id, 'C:\\');

    assert.ok(newPane);
    assert.deepEqual(newPane.layout, { x: 6, y: 0, w: 6, h: 12 });
    // creating a pane never moves the panes already on the board
    assert.deepEqual(firstPane.layout, firstLayout);
  }
});

test('a new pane fills the leftmost free space before clearing the rightmost edge', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wps7-state-'));
  const store = new StateStore(root);
  store.load();
  const paneId = store.state.sessions[0].tabs[0].panes[0].id;

  assert.equal(store.placePane(paneId, { x: 10, y: 0, w: 3, h: 12 }), true);
  const next = store.splitPane(paneId, 'horizontal');
  assert.deepEqual(next.layout, { x: 0, y: 0, w: 6, h: 12 });

  // Cells 0-5 and 10-12 are taken now, so the six-cell gap the third pane needs
  // is no longer on the left and the board grows instead.
  const third = store.splitPane(paneId, 'horizontal');
  assert.deepEqual(third.layout, { x: 13, y: 0, w: 6, h: 12 });
});

test('loading legacy cell layouts migrates them to grid cells', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wps7-state-'));
  const dataDir = path.join(root, 'data');
  fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(path.join(dataDir, 'state.json'), JSON.stringify({
    activeSessionId: 'session-1',
    updatedAt: new Date().toISOString(),
    sessions: [{
      id: 'session-1',
      name: 'Session 1',
      activePaneId: 'pane-1',
      tabs: [{
        id: 'tab-1',
        name: 'Main',
        activePaneId: 'pane-1',
        panes: [
          { id: 'pane-1', title: 'PowerShell', cwd: root, split: null, layout: { x: 0, y: 0, cols: 1, rows: 1 } },
          { id: 'pane-2', title: 'PowerShell', cwd: root, split: null, layout: { x: 1, y: 0, cols: 2, rows: 1 } },
          { id: 'pane-3', title: 'PowerShell', cwd: root, split: null, layout: { x: 0, y: 1, cols: 1, rows: 2 } }
        ]
      }]
    }]
  }));

  const store = new StateStore(root);
  store.load();
  const tab = store.state.sessions[0].tabs[0];
  // A legacy cell was 720x480 world pixels, so at a 120px grid it spans 6
  // columns. pane-1 and pane-3 share an x, so they split the 12 vertical slots.
  assert.deepEqual(
    tab.panes.map((pane) => pane.layout),
    [
      { x: 0, y: 0, w: 6, h: 6 },
      { x: 6, y: 0, w: 12, h: 12 },
      { x: 0, y: 6, w: 6, h: 6 }
    ]
  );
  assert.equal(tab.columns, undefined);
});

test('loading freeform canvas layouts migrates them to grid cells', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wps7-state-'));
  const dataDir = path.join(root, 'data');
  fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(path.join(dataDir, 'state.json'), JSON.stringify({
    activeSessionId: 'session-1',
    updatedAt: new Date().toISOString(),
    sessions: [{
      id: 'session-1',
      name: 'Session 1',
      activePaneId: 'pane-1',
      tabs: [{
        id: 'tab-1',
        name: 'Main',
        activePaneId: 'pane-1',
        camera: { x: -320, y: 128, scale: 1.5 },
        panes: [
          { id: 'pane-1', title: 'PowerShell', cwd: root, split: null, layout: { x: 960, y: 640, w: 480, h: 360, z: 3 } },
          { id: 'pane-2', title: 'PowerShell', cwd: root, split: null, layout: { x: 120, y: 120, w: 720, h: 480, z: 1 } },
          { id: 'pane-3', title: 'PowerShell', cwd: root, split: null, layout: { x: 960, y: 120, w: 480, h: 480, z: 2 } }
        ]
      }]
    }]
  }));

  const store = new StateStore(root);
  store.load();
  const tab = store.state.sessions[0].tabs[0];
  // World pixels divide by the 120px grid. The old canvas had no vertical
  // bound, so panes sharing an x split the 12 slots in ascending y order.
  assert.deepEqual(
    tab.panes.map((pane) => pane.layout),
    [
      { x: 8, y: 6, w: 4, h: 6 },
      { x: 1, y: 0, w: 6, h: 12 },
      { x: 8, y: 0, w: 4, h: 6 }
    ]
  );
});

test('grid size and vertical slots are configurable and clamp pane sizes', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wps7-state-'));
  const store = new StateStore(root, { gridSize: 60, verticalSlots: 8 });
  store.load();
  const paneId = store.state.sessions[0].tabs[0].panes[0].id;

  // a fresh pane fills the configured height
  assert.equal(store.findPane(paneId).pane.layout.h, 8);

  // a pane can never be taller than the board, and never smaller than one cell
  assert.equal(store.placePane(paneId, { x: 3, y: 0, w: 4, h: 99 }), true);
  assert.deepEqual(store.findPane(paneId).pane.layout, { x: 3, y: 0, w: 4, h: 8 });
  assert.equal(store.placePane(paneId, { x: -5, y: 0, w: 0, h: 0 }), true);
  assert.deepEqual(store.findPane(paneId).pane.layout, { x: 0, y: 0, w: 1, h: 1 });

  // y is pushed back so the pane still fits inside the board
  assert.equal(store.placePane(paneId, { x: 0, y: 7, w: 2, h: 4 }), true);
  assert.deepEqual(store.findPane(paneId).pane.layout, { x: 0, y: 4, w: 2, h: 4 });
});

test('pane move reorders panes inside its tab', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wps7-state-'));
  const store = new StateStore(root);
  store.load();
  const paneId = store.state.sessions[0].tabs[0].panes[0].id;
  const secondPane = store.splitPane(paneId, 'horizontal');
  const thirdPane = store.splitPane(secondPane.id, 'vertical');

  assert.equal(store.movePane(thirdPane.id, paneId), true);
  assert.deepEqual(
    store.state.sessions[0].tabs[0].panes.map((pane) => pane.id),
    [thirdPane.id, paneId, secondPane.id]
  );
});

// Dragging a pane's own tab to reorder it, or dropping it on another pane of
// the same kind to hand it over.
test('moveTab reorders a pane\'s own tabs and hands one to another pane of the same kind', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wps7-state-'));
  const store = new StateStore(root);
  store.load();
  const paneId = store.state.sessions[0].tabs[0].panes[0].id;
  const otherPane = store.splitPane(paneId, 'horizontal');
  const firstTabId = store.findPane(paneId).pane.terminalTabs[0].id;
  const tabA = store.createTerminalTab(paneId);
  const tabB = store.createTerminalTab(paneId);
  const idsIn = (id) => store.findPane(id).pane.terminalTabs.map((tab) => tab.id);

  assert.deepEqual(idsIn(paneId), [firstTabId, tabA.id, tabB.id]);
  const reordered = store.moveTab('terminal', paneId, tabB.id, 0);
  assert.deepEqual(reordered, { pane: store.findPane(paneId).pane });
  assert.deepEqual(idsIn(paneId), [tabB.id, firstTabId, tabA.id]);

  // Dropping past either end lands on it rather than falling out of the strip.
  store.moveTab('terminal', paneId, tabB.id, 99);
  assert.deepEqual(idsIn(paneId), [firstTabId, tabA.id, tabB.id]);

  // Handing tabA over to the other terminal pane appends it there and makes
  // it that pane's active tab, and leaves it out of the old pane entirely.
  const result = store.moveTab('terminal', paneId, tabA.id, 0, otherPane.id);
  assert.equal(result.pane.id, otherPane.id);
  assert.deepEqual(idsIn(paneId), [firstTabId, tabB.id]);
  assert.deepEqual(idsIn(otherPane.id), [otherPane.terminalTabs[0].id, tabA.id]);
  assert.equal(store.findPane(otherPane.id).pane.activeTerminalTabId, tabA.id);
});

test('moveTab refuses to empty a pane and refuses a kind mismatch', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wps7-state-'));
  const store = new StateStore(root);
  store.load();
  const paneId = store.state.sessions[0].tabs[0].panes[0].id;
  const filesPane = store.createFilesPane(paneId, 'C:\\');
  const soloTabId = store.findPane(paneId).pane.terminalTabs[0].id;

  // The only tab left in a pane cannot be dragged out of it.
  assert.equal(store.moveTab('terminal', paneId, soloTabId, 0, filesPane.id), null);

  // A files pane never accepts a terminal tab, even once there is a spare.
  store.createTerminalTab(paneId);
  assert.equal(store.moveTab('terminal', paneId, soloTabId, 0, filesPane.id), null);
  assert.equal(store.moveTab('terminal', 'missing', soloTabId, 0), null);
  assert.equal(store.moveTab('terminal', paneId, 'missing', 0), null);
});

test('files panes persist type and path without scrollback', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wps7-'));
  const store = new StateStore(root);
  store.load();
  const paneId = store.state.sessions[0].tabs[0].panes[0].id;
  const filesPane = store.createFilesPane(paneId, 'C:\\');
  store.save();

  const saved = JSON.parse(fs.readFileSync(path.join(root, 'data', 'state.json'), 'utf8'));
  const savedPane = saved.sessions[0].tabs[0].panes.find((pane) => pane.id === filesPane.id);
  assert.equal(savedPane.type, 'files');
  assert.equal(savedPane.path, 'C:\\');
  assert.equal(savedPane.scrollback, undefined);

  const publicPane = store.getPublicState().sessions[0].tabs[0].panes.find((pane) => pane.id === filesPane.id);
  assert.equal(publicPane.type, 'files');
  assert.equal(publicPane.path, 'C:\\');
});

test('allows more than one files pane in the same tab', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wps7-'));
  const store = new StateStore(root);
  store.load();
  const paneId = store.state.sessions[0].tabs[0].panes[0].id;

  const first = store.createFilesPane(paneId, 'C:\\');
  const second = store.createFilesPane(first.id, 'D:\\');

  assert.notEqual(first.id, second.id);
  assert.equal(store.state.sessions[0].tabs[0].panes.filter((pane) => pane.type === 'files').length, 2);
});

test('usage panes persist as workspace panes', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wps7-state-'));
  const store = new StateStore(root);
  store.load();
  const firstPane = store.state.sessions[0].tabs[0].panes[0];
  const usagePane = store.createUsagePane(firstPane.id);

  assert.equal(usagePane.type, 'usage');
  assert.equal(usagePane.title, 'Usage 1');
  store.save();

  const restored = new StateStore(root);
  restored.load();
  const restoredPane = restored.findPane(usagePane.id).pane;
  assert.equal(restoredPane.type, 'usage');
  assert.equal(restoredPane.title, 'Usage 1');
});

test('plugin panes persist their manifest id and bounded JSON data', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wps7-state-'));
  const store = new StateStore(root);
  store.load();
  const firstPaneId = store.state.sessions[0].tabs[0].panes[0].id;

  const pane = store.createPluginPane(firstPaneId, 'private-dashboard', 'Private dashboard');
  assert.equal(pane.type, 'plugin');
  assert.equal(pane.pluginPaneId, 'private-dashboard');
  assert.equal(pane.pluginData, '{}');
  assert.equal(pane.title, 'Private dashboard 1');

  const pluginData = JSON.stringify({ widgets: [{ id: 'clock' }] });
  assert.equal(store.setPluginPaneData(pane.id, pluginData), true);

  const reloaded = new StateStore(root);
  reloaded.load();
  const saved = reloaded.findPane(pane.id).pane;
  assert.equal(saved.type, 'plugin');
  assert.equal(saved.pluginPaneId, 'private-dashboard');
  assert.equal(saved.pluginData, pluginData);
  assert.equal(reloaded.getPublicState().sessions[0].tabs[0].panes.find((item) => item.id === pane.id).pluginPaneId, 'private-dashboard');
  assert.equal(store.setPluginPaneData(pane.id, 'not json'), true);
  assert.equal(store.findPane(pane.id).pane.pluginData, '{}');
  assert.equal(store.setPluginPaneData(firstPaneId, pluginData), false);
});

test('legacy local panes migrate to plugin panes on load', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wps7-state-'));
  const store = new StateStore(root);
  store.load();
  store.save();

  const statePath = path.join(root, 'data', 'state.json');
  const legacy = JSON.parse(fs.readFileSync(statePath, 'utf8'));
  const pane = legacy.sessions[0].tabs[0].panes[0];
  pane.type = 'local';
  pane.localPaneId = 'private-dashboard';
  fs.writeFileSync(statePath, JSON.stringify(legacy));

  const reloaded = new StateStore(root);
  reloaded.load();
  const migrated = reloaded.findPane(pane.id).pane;
  assert.equal(migrated.type, 'plugin');
  assert.equal(migrated.pluginPaneId, 'private-dashboard');
});

test('browser and notepad panes persist their URL and file path', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wps7-state-'));
  const store = new StateStore(root);
  store.load();
  const firstPane = store.state.sessions[0].tabs[0].panes[0];
  const browser = store.createBrowserPane(firstPane.id, 'https://example.com');
  const notepad = store.createNotepadPane(browser.id, 'C:\\notes.txt');

  assert.equal(browser.type, 'browser');
  assert.equal(notepad.type, 'notepad');
  assert.equal(store.setBrowserPaneUrl(browser.id, 'https://openai.com'), true);
  assert.equal(store.updateNotepadTab(notepad.id, notepad.activeNotepadTabId, { path: 'C:\\updated.txt' }), true);
  store.save();

  const restored = new StateStore(root);
  restored.load();
  const panes = restored.getPublicState().sessions[0].tabs[0].panes;
  assert.equal(panes.find((pane) => pane.id === browser.id).url, 'https://openai.com');
  assert.equal(panes.find((pane) => pane.id === notepad.id).path, 'C:\\updated.txt');
});

test('terminal panes persist multiple tabs and their active tab', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wps7-state-'));
  const store = new StateStore(root);
  store.load();
  const pane = store.state.sessions[0].tabs[0].panes[0];

  assert.equal(pane.terminalTabs.length, 1);
  assert.equal(pane.activeTerminalTabId, pane.terminalTabs[0].id);

  const secondTab = store.createTerminalTab(pane.id);
  assert.equal(pane.terminalTabs.length, 2);
  assert.equal(pane.activeTerminalTabId, secondTab.id);
  assert.equal(secondTab.title, 'PowerShell 2');
  assert.equal(secondTab.cwd, pane.cwd);
  assert.equal(secondTab.titlePinned, false);
  assert.equal(store.renameTerminalTab(pane.id, secondTab.id, 'Build'), true);
  assert.equal(secondTab.titlePinned, true);
  assert.equal(store.activateTerminalTab(pane.id, pane.terminalTabs[0].id), true);
  store.save();

  const restored = new StateStore(root);
  restored.load();
  const restoredPane = restored.findPane(pane.id).pane;
  assert.equal(restoredPane.terminalTabs.length, 2);
  assert.equal(restoredPane.terminalTabs[1].title, 'Build');
  assert.equal(restoredPane.activeTerminalTabId, restoredPane.terminalTabs[0].id);

  assert.equal(restored.closeTerminalTab(pane.id, restoredPane.terminalTabs[1].id).replacement, null);
  assert.equal(restoredPane.terminalTabs.length, 1);

  // Closing the last tab restarts the shell under a new tab id instead of emptying the pane.
  const lastId = restoredPane.terminalTabs[0].id;
  const { replacement } = restored.closeTerminalTab(pane.id, lastId);
  assert.equal(restoredPane.terminalTabs.length, 1);
  assert.notEqual(replacement.id, lastId);
  assert.equal(restoredPane.activeTerminalTabId, replacement.id);
  assert.equal(restored.closeTerminalTab(pane.id, 'missing-tab'), null);
});

test('a renamed terminal tab keeps its name while the shell keeps announcing titles', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wps7-state-'));
  const store = new StateStore(root);
  store.load();
  const pane = store.state.sessions[0].tabs[0].panes[0];
  const tab = pane.terminalTabs[0];

  // Until the user picks a name, the shell's own title is the tab's name.
  assert.equal(store.setTerminalTabProcessTitle(pane.id, tab.id, 'C:\\Users\\Admin'), true);
  assert.equal(tab.title, 'C:\\Users\\Admin');
  assert.equal(tab.titlePinned, false);

  assert.equal(store.renameTerminalTab(pane.id, tab.id, 'Build'), true);
  assert.equal(tab.titlePinned, true);

  assert.equal(store.setTerminalTabProcessTitle(pane.id, tab.id, 'C:\\Windows'), false);
  assert.equal(tab.title, 'Build');

  // Restarting the shell by closing the last tab keeps the pinned name.
  const { replacement } = store.closeTerminalTab(pane.id, tab.id);
  assert.equal(replacement.title, 'Build');
  assert.equal(replacement.titlePinned, true);

  store.save();
  const restored = new StateStore(root);
  restored.load();
  const restoredTab = restored.findPane(pane.id).pane.terminalTabs[0];
  assert.equal(restoredTab.title, 'Build');
  assert.equal(restoredTab.titlePinned, true);
  assert.equal(restored.setTerminalTabProcessTitle(pane.id, restoredTab.id, 'C:\\Temp'), false);

  assert.equal(store.setTerminalTabProcessTitle(pane.id, 'missing-tab', 'Ignored'), false);
  assert.equal(store.setTerminalTabProcessTitle(pane.id, replacement.id, '   '), false);
});

test('files panes persist multiple tabs and follow the active tab path', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wps7-state-'));
  const store = new StateStore(root);
  store.load();
  const firstPane = store.state.sessions[0].tabs[0].panes[0];
  const filesPane = store.createFilesPane(firstPane.id, 'C:\\');

  assert.equal(filesPane.filesTabs.length, 1);
  assert.equal(filesPane.filesTabs[0].path, 'C:\\');

  const secondTab = store.createFilesTab(filesPane.id, 'C:\\Windows');
  assert.equal(filesPane.activeFilesTabId, secondTab.id);
  assert.equal(filesPane.path, 'C:\\Windows');

  assert.equal(store.setFilesPanePath(filesPane.id, 'C:\\Users'), true);
  assert.equal(secondTab.path, 'C:\\Users');

  assert.equal(store.activateFilesTab(filesPane.id, filesPane.filesTabs[0].id), true);
  assert.equal(filesPane.path, 'C:\\');
  store.save();

  const restored = new StateStore(root);
  restored.load();
  const restoredPane = restored.findPane(filesPane.id).pane;
  assert.equal(restoredPane.filesTabs.length, 2);
  assert.equal(restoredPane.filesTabs[1].path, 'C:\\Users');
  assert.equal(restoredPane.path, 'C:\\');

  assert.equal(restored.closeFilesTab(filesPane.id, restoredPane.filesTabs[0].id), true);
  assert.equal(restoredPane.filesTabs.length, 1);
  assert.equal(restoredPane.path, 'C:\\Users');
});

test('browser panes persist multiple tabs and their active tab', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wps7-state-'));
  const store = new StateStore(root);
  store.load();
  const firstPane = store.state.sessions[0].tabs[0].panes[0];
  const browser = store.createBrowserPane(firstPane.id, 'https://example.com', 'mobile');
  const secondTab = store.createBrowserTab(browser.id, 'https://openai.com', 'desktop');

  assert.equal(browser.browserTabs.length, 2);
  assert.equal(browser.browserTabs[0].emulationMode, 'mobile');
  assert.equal(secondTab.emulationMode, 'desktop');
  assert.equal(browser.activeBrowserTabId, secondTab.id);
  assert.equal(store.updateBrowserTab(browser.id, secondTab.id, { title: 'OpenAI', zoom: 1.25, emulationMode: 'mobile' }), true);
  assert.equal(store.activateBrowserTab(browser.id, browser.browserTabs[0].id), true);
  assert.equal(store.closeBrowserTab(browser.id, secondTab.id), true);
  store.save();

  const restored = new StateStore(root);
  restored.load();
  const restoredBrowser = restored.findPane(browser.id).pane;
  assert.equal(restoredBrowser.browserTabs.length, 1);
  assert.equal(restoredBrowser.activeBrowserTabId, restoredBrowser.browserTabs[0].id);
  assert.equal(restoredBrowser.browserTabs[0].url, 'https://example.com');
  assert.equal(restoredBrowser.browserTabs[0].emulationMode, 'mobile');
});

test('new notepad panes and tabs adopt the configured editor defaults', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wps7-state-'));
  const store = new StateStore(root);
  store.load();
  const firstPane = store.state.sessions[0].tabs[0].panes[0];
  const defaults = { wrap: true, indentGuides: true, autosave: true };
  const notepad = store.createNotepadPane(firstPane.id, 'C:\notes.txt', defaults);
  const extraTab = store.createNotepadTab(notepad.id, 'C:\todo.txt', defaults);

  assert.equal(notepad.notepadTabs[0].wrap, true);
  assert.equal(notepad.notepadTabs[0].indentGuides, true);
  assert.equal(notepad.notepadTabs[0].autosave, true);
  assert.equal(extraTab.wrap, true);
  assert.equal(extraTab.indentGuides, true);
  assert.equal(extraTab.autosave, true);

  const plain = store.createNotepadPane(firstPane.id, '');
  assert.equal(plain.notepadTabs[0].wrap, false);
  assert.equal(plain.notepadTabs[0].indentGuides, false);
  assert.equal(plain.notepadTabs[0].autosave, false);
});

test('notepad panes persist multiple tabs and their active tab', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wps7-state-'));
  const store = new StateStore(root);
  store.load();
  const firstPane = store.state.sessions[0].tabs[0].panes[0];
  const notepad = store.createNotepadPane(firstPane.id, 'C:\\notes.txt');
  const secondTab = store.createNotepadTab(notepad.id, 'C:\\todo.txt');

  assert.equal(notepad.notepadTabs.length, 2);
  assert.equal(notepad.activeNotepadTabId, secondTab.id);
  assert.equal(store.updateNotepadTab(notepad.id, secondTab.id, { title: 'todo.txt' }), true);
  assert.equal(store.activateNotepadTab(notepad.id, notepad.notepadTabs[0].id), true);
  assert.equal(store.closeNotepadTab(notepad.id, secondTab.id), true);
  store.save();

  const restored = new StateStore(root);
  restored.load();
  const restoredNotepad = restored.findPane(notepad.id).pane;
  assert.equal(restoredNotepad.notepadTabs.length, 1);
  assert.equal(restoredNotepad.activeNotepadTabId, restoredNotepad.notepadTabs[0].id);
  assert.equal(restoredNotepad.notepadTabs[0].path, 'C:\\notes.txt');
});

test('notepad autosave drafts and editor preferences persist without a file path', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wps7-state-'));
  const store = new StateStore(root);
  store.load();
  const firstPane = store.state.sessions[0].tabs[0].panes[0];
  const notepad = store.createNotepadPane(firstPane.id);
  const tabId = notepad.activeNotepadTabId;

  assert.equal(store.updateNotepadTab(notepad.id, tabId, {
    content: 'server draft',
    encoding: 'utf8',
    wrap: true,
    indentGuides: true,
    autosave: true,
    fontFamily: '"Cascadia Mono", Consolas, monospace'
  }), true);

  const restored = new StateStore(root);
  restored.load();
  const restoredTab = restored.findPane(notepad.id).pane.notepadTabs[0];
  assert.equal(restoredTab.path, '');
  assert.equal(restoredTab.content, 'server draft');
  assert.equal(restoredTab.encoding, 'utf8');
  assert.equal(restoredTab.wrap, true);
  assert.equal(restoredTab.indentGuides, true);
  assert.equal(restoredTab.autosave, true);
  assert.equal(restoredTab.fontFamily, '"Cascadia Mono", Consolas, monospace');

  assert.equal(restored.closeNotepadTab(notepad.id, tabId), true);
  const clearedTab = restored.findPane(notepad.id).pane.notepadTabs[0];
  assert.equal(clearedTab.content, '');
  assert.equal(clearedTab.autosave, false);
});

test('notepad tabs persist their line ending, language override, and read-only lock', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wps7-state-'));
  const store = new StateStore(root);
  store.load();
  const firstPane = store.state.sessions[0].tabs[0].panes[0];
  const notepad = store.createNotepadPane(firstPane.id, 'C:\\notes.md');
  const tabId = notepad.activeNotepadTabId;

  assert.equal(notepad.notepadTabs[0].eol, 'crlf');
  assert.equal(notepad.notepadTabs[0].language, '');
  assert.equal(notepad.notepadTabs[0].readOnly, false);

  assert.equal(store.updateNotepadTab(notepad.id, tabId, {
    eol: 'lf', language: 'markdown', readOnly: true
  }), true);
  // An unsupported line ending is ignored rather than corrupting the saved file.
  assert.equal(store.updateNotepadTab(notepad.id, tabId, { eol: 'nel' }), true);

  const restored = new StateStore(root);
  restored.load();
  const restoredTab = restored.findPane(notepad.id).pane.notepadTabs[0];
  assert.equal(restoredTab.eol, 'lf');
  assert.equal(restoredTab.language, 'markdown');
  assert.equal(restoredTab.readOnly, true);
});

test('legacy terminal pane mode is discarded', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wps7-state-'));
  const dataDir = path.join(root, 'data');
  fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(path.join(dataDir, 'state.json'), JSON.stringify({
    activeSessionId: 'session-1',
    sessions: [{
      id: 'session-1',
      name: 'Session 1',
      activePaneId: 'pane-1',
      tabs: [{
        id: 'tab-1',
        name: 'Main',
        activePaneId: 'pane-1',
        panes: [{ id: 'pane-1', title: 'PowerShell', mode: 'tui' }]
      }]
    }]
  }));
  const store = new StateStore(root);
  store.load();
  assert.equal(store.state.sessions[0].tabs[0].panes[0].mode, undefined);
  assert.equal(store.getPublicState().sessions[0].tabs[0].panes[0].mode, undefined);
  store.save();

  const saved = JSON.parse(fs.readFileSync(path.join(root, 'data', 'state.json'), 'utf8'));
  assert.equal(saved.sessions[0].tabs[0].panes[0].mode, undefined);
});

test('loading state with a deleted or moved pane cwd falls back to the app root', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wps7-state-'));
  const dataDir = path.join(root, 'data');
  fs.mkdirSync(dataDir, { recursive: true });
  const missingCwd = path.join(root, 'moved-away-folder');
  fs.writeFileSync(path.join(dataDir, 'state.json'), JSON.stringify({
    activeSessionId: 'session-1',
    sessions: [{
      id: 'session-1',
      name: 'Session 1',
      activePaneId: 'pane-1',
      tabs: [{
        id: 'tab-1',
        name: 'Main',
        activePaneId: 'pane-1',
        panes: [{ id: 'pane-1', title: 'PowerShell', cwd: missingCwd, split: null }]
      }]
    }]
  }));

  const store = new StateStore(root);
  store.load();
  assert.equal(store.findPane('pane-1').pane.cwd, root);
});

test('loading legacy panes marks them as terminal', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wps7-'));
  const dataDir = path.join(root, 'data');
  fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(path.join(dataDir, 'state.json'), JSON.stringify({
    activeSessionId: 'session-1',
    sessions: [{
      id: 'session-1',
      name: 'Session 1',
      activePaneId: 'pane-1',
      tabs: [{
        id: 'tab-1',
        name: 'Main',
        activePaneId: 'pane-1',
        panes: [{ id: 'pane-1', title: 'PowerShell', cwd: root, layout: { x: 0, y: 0, cols: 1, rows: 1 } }]
      }]
    }]
  }));
  const store = new StateStore(root);
  store.load();
  assert.equal(store.state.sessions[0].tabs[0].panes[0].type, 'terminal');
});

test('legacy whiteboard panes migrate to the whiteboard plugin without losing their scene', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wps7-state-'));
  const scene = JSON.stringify({ elements: [{ id: 'a', type: 'rectangle' }], appState: { gridSize: 20 } });
  const dataDir = path.join(root, 'data');
  fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(path.join(dataDir, 'state.json'), JSON.stringify({
    activeSessionId: 'session-1',
    sessions: [{
      id: 'session-1',
      name: 'Workspace 1',
      tabs: [{
        id: 'tab-1',
        name: 'Main',
        activePaneId: 'pane-1',
        panes: [{ id: 'pane-1', type: 'whiteboard', title: 'Whiteboard 1', whiteboard: scene }]
      }]
    }]
  }));

  const store = new StateStore(root, {
    pluginPaneMigrations: { whiteboard: { pluginPaneId: 'whiteboard', dataField: 'whiteboard' } }
  });
  store.load();
  const pane = store.findPane('pane-1').pane;
  assert.equal(pane.type, 'plugin');
  assert.equal(pane.pluginPaneId, 'whiteboard');
  assert.equal(pane.pluginData, scene);
});

test('saving keeps the previous file as a backup and leaves no temp file behind', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wps7-state-'));
  const store = new StateStore(root);
  store.load();
  // renameSession persists on its own, so these are two consecutive writes.
  store.renameSession(store.state.activeSessionId, 'First');
  store.renameSession(store.state.activeSessionId, 'Second');

  const dataDir = path.join(root, 'data');
  const current = JSON.parse(fs.readFileSync(path.join(dataDir, 'state.json'), 'utf8'));
  const backup = JSON.parse(fs.readFileSync(path.join(dataDir, 'state.json.bak'), 'utf8'));
  assert.equal(current.sessions[0].name, 'Second');
  assert.equal(backup.sessions[0].name, 'First');
  assert.equal(fs.readdirSync(dataDir).some((name) => name.endsWith('.tmp')), false);
});

test('loading recovers from the backup when state.json is truncated', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wps7-state-'));
  const store = new StateStore(root);
  store.load();
  store.renameSession(store.state.activeSessionId, 'Survivor');
  store.renameSession(store.state.activeSessionId, 'Doomed');

  // Simulates losing power midway through a write.
  const statePath = path.join(root, 'data', 'state.json');
  fs.writeFileSync(statePath, '{"sessions":[{"na');

  const reloaded = new StateStore(root);
  reloaded.load();
  assert.equal(reloaded.state.sessions[0].name, 'Survivor');
});

test('loading falls back to a fresh workspace when both copies are unreadable', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wps7-state-'));
  const store = new StateStore(root);
  store.load();
  store.save();
  store.save();

  const dataDir = path.join(root, 'data');
  fs.writeFileSync(path.join(dataDir, 'state.json'), 'not json');
  fs.writeFileSync(path.join(dataDir, 'state.json.bak'), 'also not json');

  const reloaded = new StateStore(root);
  reloaded.load();
  assert.equal(reloaded.state.sessions.length, 1);
  assert.equal(reloaded.state.sessions[0].tabs[0].panes.length, 1);
});

test('image panes persist only their current picture path', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wps7-state-'));
  const store = new StateStore(root);
  store.load();
  const basePaneId = store.state.sessions[0].tabs[0].panes[0].id;

  const pane = store.createImagePane(basePaneId, 'C:\\pictures\\a.png');
  assert.equal(pane.type, 'image');
  assert.equal(pane.path, 'C:\\pictures\\a.png');

  assert.equal(store.setImagePanePath(pane.id, 'C:\\pictures\\b.png'), true);
  assert.equal(store.setImagePanePath(basePaneId, 'C:\\pictures\\b.png'), false);

  const persisted = store.getPersistedState().sessions[0].tabs[0].panes.find((item) => item.id === pane.id);
  assert.equal(persisted.path, 'C:\\pictures\\b.png');

  const reloaded = new StateStore(root);
  reloaded.load();
  const restored = reloaded.findPane(pane.id).pane;
  assert.equal(restored.type, 'image');
  assert.equal(restored.path, 'C:\\pictures\\b.png');
});

test('a cmd pane names and stores its own shell, and its tabs inherit it', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wps7-state-'));
  const store = new StateStore(root);
  store.load();
  const paneId = store.state.sessions[0].tabs[0].panes[0].id;

  const cmdPane = store.splitPane(paneId, 'horizontal', 'cmd');
  assert.equal(cmdPane.title, 'CMD 1');
  assert.equal(cmdPane.terminalTabs[0].shell, 'cmd');
  // The PowerShell pane it was opened from is untouched.
  assert.equal(store.findPane(paneId).pane.terminalTabs[0].shell, 'powershell');

  // The pane's own "+" button opens another cmd tab, never a PowerShell one.
  const secondTab = store.createTerminalTab(cmdPane.id);
  assert.equal(secondTab.shell, 'cmd');
  assert.equal(secondTab.title, 'CMD 2');

  const nextPowerShell = store.splitPane(paneId, 'horizontal');
  assert.equal(nextPowerShell.title, 'PowerShell 2');
  assert.equal(nextPowerShell.terminalTabs[0].shell, 'powershell');

  store.save();
  const reloaded = new StateStore(root);
  reloaded.load();
  assert.equal(reloaded.findPane(cmdPane.id).pane.terminalTabs[0].shell, 'cmd');
  assert.equal(reloaded.findPane(paneId).pane.terminalTabs[0].shell, 'powershell');
});

// Closing the last tab restarts the shell in place, so it has to restart the
// same shell rather than falling back to PowerShell.
test('closing the last cmd tab restarts cmd', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wps7-state-'));
  const store = new StateStore(root);
  store.load();
  const paneId = store.state.sessions[0].tabs[0].panes[0].id;
  const cmdPane = store.splitPane(paneId, 'horizontal', 'cmd');

  const { replacement } = store.closeTerminalTab(cmdPane.id, cmdPane.terminalTabs[0].id);

  assert.equal(replacement.shell, 'cmd');
  assert.equal(cmdPane.terminalTabs[0].shell, 'cmd');
});

// Each AI tab is its own conversation: its own CLI process, its own provider
// and its own resume id, exactly like a terminal pane's tabs are separate
// shells.
test('ai panes persist a conversation per tab', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wps7-state-'));
  const store = new StateStore(root);
  store.load();
  const firstPane = store.state.sessions[0].tabs[0].panes[0];

  const pane = store.createAiPane(firstPane.id, 'claude');
  assert.equal(pane.type, 'ai');
  assert.equal(pane.aiTabs.length, 1);
  assert.equal(pane.aiTabs[0].provider, 'claude');
  assert.equal(pane.activeAiTabId, pane.aiTabs[0].id);

  const second = store.createAiTab(pane.id, 'codex');
  assert.equal(second.provider, 'codex');
  assert.equal(pane.aiTabs.length, 2);
  assert.equal(pane.activeAiTabId, second.id);

  store.appendAiMessages(pane.id, pane.aiTabs[0].id, [
    { role: 'user', kind: 'text', text: 'hello claude' }
  ]);
  store.appendAiMessages(pane.id, second.id, [
    { role: 'user', kind: 'text', text: 'hello codex' }
  ]);
  store.setAiSession(pane.id, pane.aiTabs[0].id, 'claude-session-1');
  store.setAiSession(pane.id, second.id, 'codex-thread-1');
  store.save();

  const restored = new StateStore(root);
  restored.load();
  const restoredPane = restored.findPane(pane.id).pane;
  assert.equal(restoredPane.aiTabs.length, 2);
  assert.equal(restoredPane.aiTabs[0].sessionId, 'claude-session-1');
  assert.equal(restoredPane.aiTabs[0].messages[0].text, 'hello claude');
  assert.equal(restoredPane.aiTabs[1].sessionId, 'codex-thread-1');
  assert.equal(restoredPane.aiTabs[1].messages[0].text, 'hello codex');
});

test('a drop-in AI plugin provider survives a state reload', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wps7-state-'));
  const store = new StateStore(root);
  store.load();
  const firstPane = store.state.sessions[0].tabs[0].panes[0];
  const pane = store.createAiPane(firstPane.id, 'drop-in-agent');

  assert.equal(pane.aiTabs[0].provider, 'drop-in-agent');

  const restored = new StateStore(root);
  restored.load();
  assert.equal(restored.findPane(pane.id).pane.aiTabs[0].provider, 'drop-in-agent');
});

// The transcript is the one piece of pane state that grows without bound, so
// /api/state must not carry it; the pane's socket replays it instead.
test('ai transcripts are saved but kept out of the public state', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wps7-state-'));
  const store = new StateStore(root);
  store.load();
  const firstPane = store.state.sessions[0].tabs[0].panes[0];
  const pane = store.createAiPane(firstPane.id, 'claude');
  const tabId = pane.activeAiTabId;

  store.appendAiMessages(pane.id, tabId, [{ role: 'assistant', kind: 'text', text: 'hi' }]);
  store.save();

  const saved = JSON.parse(fs.readFileSync(path.join(root, 'data', 'state.json'), 'utf8'));
  const savedPane = saved.sessions[0].tabs[0].panes.find((candidate) => candidate.type === 'ai');
  assert.equal(savedPane.aiTabs[0].messages[0].text, 'hi');

  const publicPane = store.getPublicState().sessions[0].tabs[0].panes
    .find((candidate) => candidate.type === 'ai');
  assert.equal(publicPane.aiTabs[0].messages, undefined);
  assert.equal(publicPane.aiTabs[0].provider, 'claude');
});

// The bytes never reach state.json -- see AiManager.saveAttachments -- so the
// event only ever carries the filename that reaches them on disk, and only
// once it looks like one this store could have produced.
test('an ai event only keeps image references that match the attachment filename pattern', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wps7-state-'));
  const store = new StateStore(root);
  store.load();
  const firstPane = store.state.sessions[0].tabs[0].panes[0];
  const pane = store.createAiPane(firstPane.id, 'claude');
  const tabId = pane.activeAiTabId;

  const [stored] = store.appendAiMessages(pane.id, tabId, [{
    role: 'user',
    kind: 'text',
    text: '',
    images: [
      { id: '3f9c2b6a-1e4d-4c8f-9a2b-6a1e4d4c8f9a.png', mimeType: 'image/png' },
      { id: '../../etc/passwd', mimeType: 'image/png' },
      { id: 'no-extension', mimeType: 'image/png' }
    ]
  }]);

  assert.deepEqual(stored.images, [{ id: '3f9c2b6a-1e4d-4c8f-9a2b-6a1e4d4c8f9a.png', mimeType: 'image/png' }]);
});

// Dropping half a turn would leave a tool result with no tool call above it, so
// the oldest whole turns go instead.
test('ai history is trimmed a whole turn at a time', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wps7-state-'));
  const store = new StateStore(root);
  store.load();
  const firstPane = store.state.sessions[0].tabs[0].panes[0];
  const pane = store.createAiPane(firstPane.id, 'claude');
  const tabId = pane.activeAiTabId;

  for (let turn = 0; turn < 900; turn += 1) {
    store.appendAiMessages(pane.id, tabId, [
      { turnId: `turn-${turn}`, role: 'assistant', kind: 'tool_use', tool: { name: 'Bash', input: 'echo hi' } },
      { turnId: `turn-${turn}`, role: 'user', kind: 'tool_result', result: { output: 'hi' } }
    ]);
  }

  const messages = store.findPane(pane.id).pane.aiTabs[0].messages;
  assert.ok(messages.length < 1800, 'history should have been trimmed');
  const turnIds = [...new Set(messages.filter((event) => event.turnId).map((event) => event.turnId))];
  for (const turnId of turnIds) {
    const inTurn = messages.filter((event) => event.turnId === turnId);
    assert.equal(inTurn.length, 2, `turn ${turnId} should keep both of its events`);
  }
  assert.equal(messages[0].kind, 'notice');
});

// Clearing has to drop the CLI session id too, or the next prompt resumes the
// conversation the user just asked to forget.
test('clearing an ai tab drops the transcript and the resume id', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wps7-state-'));
  const store = new StateStore(root);
  store.load();
  const firstPane = store.state.sessions[0].tabs[0].panes[0];
  const pane = store.createAiPane(firstPane.id, 'claude');
  const tabId = pane.activeAiTabId;

  store.appendAiMessages(pane.id, tabId, [{ role: 'user', kind: 'text', text: 'remember this' }]);
  store.setAiSession(pane.id, tabId, 'session-to-forget');

  assert.equal(store.clearAiTab(pane.id, tabId), true);
  assert.deepEqual(store.findPane(pane.id).pane.aiTabs[0].messages, []);
  assert.equal(store.findPane(pane.id).pane.aiTabs[0].sessionId, '');
});

// A pending question that is answered later is patched in place, so a reload
// shows the answer rather than a dead set of buttons.
test('ai question events can be answered in place', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wps7-state-'));
  const store = new StateStore(root);
  store.load();
  const firstPane = store.state.sessions[0].tabs[0].panes[0];
  const pane = store.createAiPane(firstPane.id, 'claude');
  const tabId = pane.activeAiTabId;

  const [question] = store.appendAiMessages(pane.id, tabId, [{
    role: 'assistant',
    kind: 'question',
    question: {
      requestId: 'req-1',
      prompt: 'Allow Write?',
      options: [{ id: 'allow', label: 'Allow' }, { id: 'deny', label: 'Deny' }]
    }
  }]);

  assert.equal(store.patchAiMessage(pane.id, tabId, question.id, {
    answer: { optionIds: ['allow'], labels: ['Allow'] }
  }), true);
  const stored = store.findPane(pane.id).pane.aiTabs[0].messages[0];
  assert.deepEqual(stored.answer.optionIds, ['allow']);
  assert.equal(stored.question.requestId, 'req-1');
});


// A second tab is opened beside the first, so it continues with the same CLI in
// the same folder rather than falling back to the configured default.
test('a new ai tab follows the tab it was opened beside', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wps7-state-'));
  const store = new StateStore(root);
  store.load();
  const pane = store.createAiPane(store.state.sessions[0].tabs[0].panes[0].id, 'codex');
  store.setAiTabCwd(pane.id, pane.activeAiTabId, root);

  const inherited = store.createAiTab(pane.id);
  assert.equal(inherited.provider, 'codex');
  assert.equal(inherited.cwd, root);

  // An explicit choice still wins, which is what the rail buttons rely on.
  const explicit = store.createAiTab(pane.id, 'claude');
  assert.equal(explicit.provider, 'claude');
});

test('an ai pane and tab can be started in a chosen folder', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wps7-state-'));
  const elsewhere = fs.mkdtempSync(path.join(os.tmpdir(), 'wps7-work-'));
  const store = new StateStore(root);
  store.load();

  const pane = store.createAiPane(store.state.sessions[0].tabs[0].panes[0].id, 'claude', elsewhere);
  assert.equal(pane.aiTabs[0].cwd, elsewhere);

  assert.equal(store.setAiTabCwd(pane.id, pane.activeAiTabId, root), true);
  store.save();

  const restored = new StateStore(root);
  restored.load();
  assert.equal(restored.findPane(pane.id).pane.aiTabs[0].cwd, root);
});
