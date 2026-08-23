(function () {
  function createWhiteboardPane({ assetBaseUrl, getTheme, saveData }) {
    const whiteboards = new Map();
    const saveTimers = new Map();
    let excalidrawLoader = null;

    function loadVendorScript(src) {
      return new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = src;
        script.onload = resolve;
        script.onerror = () => reject(new Error(`Failed to load ${src}`));
        document.head.appendChild(script);
      });
    }

    function loadExcalidraw() {
      if (!excalidrawLoader) {
        // Without this, Excalidraw falls back to unpkg.com and breaks offline.
        window.EXCALIDRAW_ASSET_PATH = `${assetBaseUrl}excalidraw/`;
        excalidrawLoader = ['react.js', 'react-dom.js', 'jsx-runtime.js', 'excalidraw.js']
          .reduce(
            (chain, file) => chain.then(() => loadVendorScript(`${assetBaseUrl}excalidraw/${file}`)),
            Promise.resolve()
          );
      }
      return excalidrawLoader;
    }

    function parseWhiteboard(content) {
      try {
        const data = JSON.parse(content || '{}');
        return { elements: data.elements || [], appState: data.appState || {} };
      } catch {
        return { elements: [], appState: {} };
      }
    }

    function saveWhiteboardSoon(paneId, data) {
      window.clearTimeout(saveTimers.get(paneId));
      saveTimers.set(paneId, window.setTimeout(() => {
        saveTimers.delete(paneId);
        saveData(paneId, data).catch(() => {});
      }, 600));
    }

    async function mount(pane) {
      const host = document.getElementById(`whiteboard-${pane.id}`);
      if (!host || whiteboards.has(pane.id)) {
        return;
      }
      try {
        await loadExcalidraw();
      } catch (error) {
        host.textContent = error.message;
        return;
      }
      if (!document.body.contains(host)) {
        return;
      }
      const root = window.ReactDOM.createRoot(host);
      const entry = { root, api: null };
      whiteboards.set(pane.id, entry);
      root.render(window.React.createElement(window.ExcalidrawLib.Excalidraw, {
        initialData: parseWhiteboard(pane.pluginData),
        theme: getTheme(),
        excalidrawAPI: (api) => { entry.api = api; },
        // Live-session fields include Maps, so persist only stable preferences.
        onChange: (elements, appState) => saveWhiteboardSoon(pane.id, {
          elements,
          appState: {
            viewBackgroundColor: appState.viewBackgroundColor,
            gridSize: appState.gridSize
          }
        })
      }));
    }

    function disposeAll() {
      for (const entry of whiteboards.values()) {
        entry.root.unmount();
      }
      whiteboards.clear();
    }

    function refreshOffsets() {
      for (const entry of whiteboards.values()) {
        entry.api?.refresh();
      }
    }

    function setTheme(theme) {
      for (const entry of whiteboards.values()) {
        entry.api?.updateScene({ appState: { theme } });
      }
    }

    return {
      render: (pane) => `<div class="whiteboard" id="whiteboard-${pane.id}" data-whiteboard="${pane.id}"></div>`,
      mount,
      disposeAll,
      refreshOffsets,
      setTheme
    };
  }

  window.Wps7HostPanePlugins = window.Wps7HostPanePlugins || {};
  window.Wps7HostPanePlugins.whiteboard = { create: createWhiteboardPane };
}());
