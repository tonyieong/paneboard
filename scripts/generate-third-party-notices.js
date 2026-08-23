// Regenerates THIRD-PARTY-LICENSES.md. Run before tagging a release, because
// wps7.exe embeds every production dependency and MIT requires their notices to
// travel with the copies we distribute.
const fs = require('fs');
const path = require('path');
const { LICENSE_SOURCES, sourcePath, verifyLicenseSources } = require('./sync-third-party-license-sources');

const root = path.join(__dirname, '..');
const LICENSE_FILE_PATTERN = /^LICEN[CS]E(?:[._-].*)?$/i;
const COPYING_FILES = new Set(['COPYING', 'COPYING.md', 'COPYING.txt']);
const LICENSE_SOURCE_OVERRIDES = {
  '@xterm/addon-serialize': path.join(root, 'node_modules', '@xterm', 'xterm', 'LICENSE'),
  '@xterm/headless': path.join(root, 'node_modules', '@xterm', 'xterm', 'LICENSE')
};
const sourceById = new Map(LICENSE_SOURCES.map((source) => [source.id, source]));

// Front-end code we vendored by hand, so it has no package.json to read.
const VENDORED = [
  {
    name: 'Excalidraw',
    location: 'plugin-panes/whiteboard/assets/excalidraw/excalidraw.js',
    license: 'MIT',
    copyright: 'Copyright (c) 2020 Excalidraw',
    homepage: 'https://github.com/excalidraw/excalidraw'
  },
  {
    name: 'React / ReactDOM',
    location: 'plugin-panes/whiteboard/assets/excalidraw/react.js, react-dom.js, jsx-runtime.js',
    license: 'MIT',
    copyright: 'Copyright (c) Meta Platforms, Inc. and affiliates.',
    homepage: 'https://github.com/facebook/react'
  },
  {
    name: 'xterm.js',
    location: 'public/vendor/xterm/, public/vendor/addon-fit/',
    license: 'MIT',
    copyright: 'Copyright (c) 2017-2019, The xterm.js authors',
    homepage: 'https://github.com/xtermjs/xterm.js'
  },
  {
    name: 'Assistant (font)',
    location: 'plugin-panes/whiteboard/assets/excalidraw/excalidraw-assets/Assistant-*.woff2',
    license: 'SIL Open Font License 1.1',
    copyright: 'Copyright (c) 2016 The Assistant Project Authors',
    homepage: 'https://fonts.google.com/specimen/Assistant'
  },
  {
    name: 'Cascadia Code (font)',
    location: 'plugin-panes/whiteboard/assets/excalidraw/excalidraw-assets/Cascadia.woff2',
    license: 'SIL Open Font License 1.1',
    copyright: 'Copyright (c) Microsoft Corporation',
    homepage: 'https://github.com/microsoft/cascadia-code'
  },
  {
    name: 'Virgil (font)',
    location: 'plugin-panes/whiteboard/assets/excalidraw/excalidraw-assets/Virgil.woff2',
    license: 'MIT',
    copyright: 'Copyright (c) 2020 Excalidraw',
    homepage: 'https://github.com/excalidraw/excalidraw'
  }
];

function resolvePackageDir(name, fromDir) {
  let dir = fromDir;
  for (;;) {
    const candidate = path.join(dir, 'node_modules', name);
    if (fs.existsSync(path.join(candidate, 'package.json'))) {
      return candidate;
    }
    const parent = path.dirname(dir);
    if (parent === dir) {
      return null;
    }
    dir = parent;
  }
}

function readLicenseText(dir, packageName) {
  const files = fs.readdirSync(dir)
    .filter((file) => LICENSE_FILE_PATTERN.test(file) || COPYING_FILES.has(file))
    .sort();
  if (files.length) {
    return files
      .map((file) => fs.readFileSync(path.join(dir, file), 'utf8').replace(/[ \t]+$/gm, '').trim())
      .filter(Boolean)
      .join('\n\n');
  }

  const fallback = LICENSE_SOURCE_OVERRIDES[packageName];
  if (fallback && fs.existsSync(fallback)) {
    return fs.readFileSync(fallback, 'utf8').replace(/[ \t]+$/gm, '').trim();
  }
  return '';
}

function licenseId(manifest) {
  if (typeof manifest.license === 'string') {
    return manifest.license;
  }
  if (manifest.license && manifest.license.type) {
    return manifest.license.type;
  }
  if (Array.isArray(manifest.licenses) && manifest.licenses[0]) {
    return manifest.licenses[0].type || 'UNKNOWN';
  }
  return 'UNKNOWN';
}

function collectProductionPackages() {
  const rootManifest = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  const queue = Object.keys(rootManifest.dependencies || {}).map((name) => ({ name, from: root }));
  const found = new Map();

  while (queue.length) {
    const { name, from } = queue.shift();
    const dir = resolvePackageDir(name, from);
    if (!dir) {
      continue;
    }
    const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'));
    const key = `${manifest.name}@${manifest.version}`;
    if (found.has(key)) {
      continue;
    }
    found.set(key, {
      name: manifest.name,
      version: manifest.version,
      license: licenseId(manifest),
      homepage: manifest.homepage || (manifest.repository && (manifest.repository.url || manifest.repository)) || '',
      text: readLicenseText(dir, manifest.name)
    });
    for (const dependency of Object.keys(manifest.dependencies || {})) {
      queue.push({ name: dependency, from: dir });
    }
  }

  return [...found.values()].sort((a, b) => a.name.localeCompare(b.name));
}

function render(packages) {
  const nodeRuntime = sourceById.get('node-runtime');
  const fontLicense = sourceById.get('ofl-1.1');
  const excalidrawNotice = sourceById.get('excalidraw-webpack-notice');
  const excalidrawLicense = fs.readFileSync(path.join(root, 'plugin-panes', 'whiteboard', 'assets', 'excalidraw', 'LICENSE'), 'utf8').trim();
  const xtermLicense = fs.readFileSync(path.join(root, 'public', 'vendor', 'xterm', 'LICENSE'), 'utf8').trim();
  const lines = [
    '# Third-Party Licenses',
    '',
    '<!-- Generated by scripts/generate-third-party-notices.js. Do not edit by hand. -->',
    '',
    'wps7 is distributed under the MIT License (see `LICENSE`). The packaged',
    '`wps7.exe` embeds the Node.js runtime and every production dependency listed',
    'below, and `public/vendor/` plus tracked plugin folders ship pre-built front-end code. Their notices are',
    'reproduced here as those licenses require.',
    '',
    '## Embedded Node.js runtime',
    '',
    `### Node.js v${nodeRuntime.version}`,
    '',
    `- Upstream license: ${nodeRuntime.url}`,
    `- Pinned SHA256: \`${nodeRuntime.sha256}\``,
    '',
    '```',
    fs.readFileSync(sourcePath(nodeRuntime), 'utf8').trim(),
    '```',
    '',
    '## Vendored front-end components and fonts',
    ''
  ];

  for (const item of VENDORED) {
    lines.push(`### ${item.name}`, '');
    lines.push(`- License: ${item.license}`);
    lines.push(`- ${item.copyright}`);
    lines.push(`- Upstream: ${item.homepage}`);
    lines.push(`- Bundled at: \`${item.location}\``);
    lines.push('');
  }

  lines.push(
    '## Vendored license texts',
    '',
    '### Excalidraw, React, ReactDOM, and bundled font attributions',
    '',
    '```',
    excalidrawLicense,
    '```',
    '',
    '### xterm.js and addon-fit',
    '',
    '```',
    xtermLicense,
    '```',
    '',
    '### SIL Open Font License 1.1',
    '',
    `Source: ${fontLicense.url}`,
    '',
    '```',
    fs.readFileSync(sourcePath(fontLicense), 'utf8').trim(),
    '```',
    '',
    '### Excalidraw 0.17.1 webpack notices',
    '',
    `Source: ${excalidrawNotice.url}`,
    '',
    '```',
    fs.readFileSync(sourcePath(excalidrawNotice), 'utf8').trim(),
    '```',
    '',
    `## Bundled npm dependencies (${packages.length})`,
    ''
  );

  for (const item of packages) {
    lines.push(`### ${item.name}@${item.version}`, '');
    lines.push(`License: ${item.license}`);
    if (item.homepage) {
      lines.push('', `Upstream: ${String(item.homepage).replace(/^git\+/, '').replace(/\.git$/, '')}`);
    }
    if (item.text) {
      lines.push('', '```', item.text, '```');
    }
    lines.push('');
  }

  return `${lines.join('\n').trimEnd()}\n`;
}

const sourceProblems = verifyLicenseSources();
if (sourceProblems.length) {
  throw new Error(`${sourceProblems.join('; ')}. Run "npm run licenses:sync".`);
}
const packages = collectProductionPackages();
const output = path.join(root, 'THIRD-PARTY-LICENSES.md');
fs.writeFileSync(output, render(packages));
const missing = packages.filter((item) => !item.text).map((item) => item.name);
process.stdout.write(`Wrote ${path.relative(root, output)} covering ${packages.length} npm packages and ${VENDORED.length} vendored components.\n`);
if (missing.length) {
  process.stderr.write(`No license file found in: ${missing.join(', ')}\n`);
  process.exitCode = 1;
}
