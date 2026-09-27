// Copies the folders a packaged build reads from disk next to the executable.
// The contents are copied, not the folders themselves, so running this again
// never nests scripts/scripts.
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const target = path.resolve(process.argv[2] || path.join(root, 'dist-linux'));

for (const folder of ['scripts', 'assets', 'plugin-panes']) {
  const destination = path.join(target, folder);
  fs.mkdirSync(destination, { recursive: true });
  for (const entry of fs.readdirSync(path.join(root, folder))) {
    fs.cpSync(path.join(root, folder, entry), path.join(destination, entry), { recursive: true, force: true });
  }
}
