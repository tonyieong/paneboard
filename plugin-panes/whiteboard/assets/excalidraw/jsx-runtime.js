// React 18 ships no UMD build for react/jsx-runtime, but the Excalidraw UMD
// bundle reads it off the global as ReactJSXRuntime. Delegating to
// createElement is the same transform the real runtime performs: it pulls key
// and ref out of the config and leaves everything else (children included) as
// props.
(function (global) {
  function jsx(type, config, maybeKey) {
    return global.React.createElement(
      type,
      maybeKey === undefined ? config : { ...config, key: maybeKey }
    );
  }

  global.ReactJSXRuntime = {
    jsx,
    jsxs: jsx,
    jsxDEV: jsx,
    Fragment: global.React.Fragment
  };
})(window);
