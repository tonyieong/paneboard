const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { Readable } = require('node:stream');
const files = require('../src/files');

// readTextFile also reports the modification stamp the notepad watcher polls,
// which no encoding assertion cares about.
function textPayload(result) {
  const { path: filePath, content, encoding } = result;
  return { path: filePath, content, encoding };
}

test('normalizes local drive paths and rejects unsafe roots', () => {
  const root = path.parse(os.tmpdir()).root;
  assert.equal(files.normalizeLocalPath(path.join(root, 'Users')), path.resolve(path.join(root, 'Users')));
  assert.equal(files.normalizeLocalPath('relative\\path'), null);
  assert.equal(files.normalizeLocalPath('\\\\server\\share'), null);
});

test('on Linux, paths are absolute POSIX paths and the root list is / and home', { skip: process.platform !== 'linux' }, () => {
  assert.equal(files.normalizeLocalPath('/tmp/../etc/'), '/etc');
  assert.equal(files.normalizeLocalPath('C:\\Users'), null);
  assert.equal(files.normalizeLocalPath('~/notes'), null);
  assert.deepEqual(files.listDrives(), [{ name: '/', path: '/' }, { name: os.homedir(), path: os.homedir() }]);
});

test('on Linux, a folder download zips the folder under its own name', { skip: process.platform !== 'linux' }, async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'paneboard-files-'));
  fs.mkdirSync(path.join(root, 'report'));
  fs.writeFileSync(path.join(root, 'report', 'a.txt'), 'a');
  fs.writeFileSync(path.join(root, 'b.txt'), 'b');

  const folder = await files.prepareDownload(path.join(root, 'report'));
  assert.equal(folder.name, 'report.zip');
  const bulk = await files.prepareBulkDownload([path.join(root, 'report'), path.join(root, 'b.txt')]);
  const listing = spawnSync('unzip', ['-Z1', bulk.path], { encoding: 'utf8' }).stdout.split('\n').filter(Boolean).sort();
  assert.deepEqual(listing, ['b.txt', 'report/', 'report/a.txt']);
});

test('manages folders and files inside a local path', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'paneboard-files-'));
  const created = files.createFolder(root, 'folder-a');
  assert.equal(created.type, 'directory');

  const saved = await files.saveUploadedFile(created.path, 'note.txt', Readable.from(['hello']));
  assert.equal(fs.readFileSync(saved.path, 'utf8'), 'hello');

  const renamed = files.renameItem(saved.path, 'renamed.txt');
  assert.equal(renamed.name, 'renamed.txt');

  const listing = files.listDirectory(created.path);
  assert.deepEqual(listing.entries.map((entry) => entry.name), ['renamed.txt']);

  assert.equal(files.deleteItem(renamed.path).ok, true);
  assert.equal(files.deleteItem(created.path).ok, true);
});

test('copies files and folders without disturbing the source, deduping name clashes', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'paneboard-files-'));
  const source = fs.mkdtempSync(path.join(os.tmpdir(), 'paneboard-files-src-'));
  const sourceFile = path.join(source, 'note.txt');
  fs.writeFileSync(sourceFile, 'hello');
  fs.mkdirSync(path.join(source, 'nested'));
  fs.writeFileSync(path.join(source, 'nested', 'inner.txt'), 'inner');

  const copiedFile = files.copyItem(sourceFile, root);
  assert.equal(fs.readFileSync(copiedFile.path, 'utf8'), 'hello');
  assert.equal(fs.existsSync(sourceFile), true);

  const copiedFolder = files.copyItem(source, root);
  assert.equal(copiedFolder.type, 'directory');
  assert.equal(fs.readFileSync(path.join(copiedFolder.path, 'nested', 'inner.txt'), 'utf8'), 'inner');
  assert.equal(fs.existsSync(source), true);

  const duplicate = files.copyItem(sourceFile, root);
  assert.notEqual(duplicate.path, copiedFile.path);
  assert.equal(fs.readFileSync(duplicate.path, 'utf8'), 'hello');
});

test('repairs utf8 filenames decoded as latin1 mojibake', async () => {
  const mojibake = 'ãæå¡è§èæ¡ä¾éãç¬¬ä¸å­£-éç¨.pdf';
  assert.equal(files.repairMojibakeFilename(mojibake), '【服务规范案例集】第三季-通用.pdf');
  assert.equal(files.repairMojibakeFilename('note.txt'), 'note.txt');
});

test('creates empty files and preserves uploaded folder paths', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'paneboard-files-'));
  const created = files.createFile(root, 'empty.txt');
  assert.equal(created.type, 'file');
  assert.equal(fs.readFileSync(created.path, 'utf8'), '');

  const uploaded = await files.saveUploadedFile(root, 'folder-a/nested/note.txt', Readable.from(['nested']));
  assert.equal(fs.readFileSync(uploaded.path, 'utf8'), 'nested');
  assert.equal(path.relative(root, uploaded.path), path.join('folder-a', 'nested', 'note.txt'));
  await assert.rejects(
    files.saveUploadedFile(root, '../outside.txt', Readable.from(['unsafe'])),
    /Invalid file name/
  );
});

test('marks dot files hidden and recursively deletes folders', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'paneboard-files-'));
  fs.writeFileSync(path.join(root, '.hidden.txt'), 'hidden');
  fs.mkdirSync(path.join(root, 'folder', 'nested'), { recursive: true });
  fs.writeFileSync(path.join(root, 'folder', 'nested', 'note.txt'), 'note');

  const hidden = files.listDirectory(root).entries.find((entry) => entry.name === '.hidden.txt');
  assert.equal(hidden.hidden, true);
  assert.equal(files.downloadInfo(path.join(root, 'folder')).type, 'directory');
  assert.equal(files.deleteItem(path.join(root, 'folder')).ok, true);
  assert.equal(fs.existsSync(path.join(root, 'folder')), false);
});

test('bulk delete continues past failures and reports each item', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'paneboard-files-'));
  const keep = path.join(root, 'keep.txt');
  const gone = path.join(root, 'gone.txt');
  fs.writeFileSync(keep, 'keep');
  fs.writeFileSync(gone, 'gone');
  const missing = path.join(root, 'missing.txt');

  const { results } = files.deleteItems([gone, missing, keep]);
  assert.equal(results.length, 3);
  assert.equal(results[0].ok, true);
  assert.equal(results[1].ok, false);
  assert.equal(results[2].ok, true);
  assert.equal(fs.existsSync(gone), false);
  assert.equal(fs.existsSync(keep), false);
});

test('bulk download rejects empty selections and delegates single items', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'paneboard-files-'));
  const only = path.join(root, 'only.txt');
  fs.writeFileSync(only, 'only');

  assert.throws(() => files.prepareBulkDownload([]), /No files selected/);
  const single = await files.prepareBulkDownload([only]);
  assert.equal(single.type, 'file');
  assert.equal(single.path, path.resolve(only));
});

test('bulk download archives multiple items into one zip', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'paneboard-files-'));
  const first = path.join(root, 'first.txt');
  const second = path.join(root, 'second.txt');
  fs.writeFileSync(first, 'first');
  fs.writeFileSync(second, 'second');

  const archive = await files.prepareBulkDownload([first, second]);
  assert.equal(archive.type, 'archive');
  assert.equal(archive.temporary, true);
  assert.ok(fs.statSync(archive.path).size > 0);
  fs.unlinkSync(archive.path);
});

test('reads and writes text files while preserving UTF-8 and UTF-16 encodings', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'paneboard-files-'));
  const utf8Path = path.join(root, 'notes.txt');
  const utf16Path = path.join(root, 'unicode.txt');
  fs.writeFileSync(utf8Path, '\uFEFFone\ntwo', 'utf8');
  fs.writeFileSync(utf16Path, Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from('甲\n乙', 'utf16le')]));

  assert.deepEqual(textPayload(files.readTextFile(utf8Path)), { path: utf8Path, content: 'one\ntwo', encoding: 'utf8-bom' });
  assert.deepEqual(textPayload(files.readTextFile(utf16Path)), { path: utf16Path, content: '甲\n乙', encoding: 'utf16le' });
  files.writeTextFile(utf16Path, '新\n文字', 'utf16le');
  assert.deepEqual(textPayload(files.readTextFile(utf16Path)), { path: utf16Path, content: '新\n文字', encoding: 'utf16le' });
});

test('text files report a modification stamp that follows an external rewrite', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'paneboard-files-'));
  const notePath = path.join(root, 'note.txt');
  fs.writeFileSync(notePath, 'first');

  const opened = files.readTextFile(notePath);
  assert.deepEqual(files.fileStamp(notePath), { path: notePath, mtimeMs: opened.mtimeMs, size: opened.size });

  fs.writeFileSync(notePath, 'rewritten by another program');
  const changed = files.fileStamp(notePath);
  assert.notDeepEqual([changed.mtimeMs, changed.size], [opened.mtimeMs, opened.size]);
  assert.equal(files.readTextFile(notePath).content, 'rewritten by another program');

  assert.throws(() => files.fileStamp(root), /not a file/i);
  assert.throws(() => files.fileStamp('relative\note.txt'), /invalid local path/i);
});

test('text editor rejects directories and binary files', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'paneboard-files-'));
  const binaryPath = path.join(root, 'binary.bin');
  fs.writeFileSync(binaryPath, Buffer.from([0, 1, 2, 3]));

  assert.throws(() => files.readTextFile(root), /not a file/i);
  assert.throws(() => files.readTextFile(binaryPath), /binary/i);
});

test('image viewer resolves supported types and rejects everything else', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'paneboard-files-'));
  const pngPath = path.join(root, 'photo.png');
  const textPath = path.join(root, 'notes.txt');
  fs.writeFileSync(pngPath, Buffer.from([0x89, 0x50, 0x4e, 0x47]));
  fs.writeFileSync(textPath, 'hello');

  assert.equal(files.imageContentType('shot.JPEG'), 'image/jpeg');
  assert.equal(files.imageContentType('notes.txt'), '');
  assert.equal(files.imageInfo(pngPath).contentType, 'image/png');
  assert.throws(() => files.imageInfo(textPath), /not a supported image/i);
  assert.throws(() => files.imageInfo(root), /not a supported image/i);
});

test('image siblings list the pictures beside a file in name order', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'paneboard-files-'));
  for (const name of ['b.png', 'a.jpg', 'notes.txt', 'c.webp']) {
    fs.writeFileSync(path.join(root, name), 'x');
  }

  const siblings = files.listImageSiblings(path.join(root, 'b.png'));
  assert.equal(siblings.directory, path.resolve(root));
  assert.deepEqual(siblings.entries.map((entry) => path.basename(entry)), ['a.jpg', 'b.png', 'c.webp']);
});

test('image siblings still include a picture whose folder cannot be listed', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'paneboard-files-'));
  const missing = path.join(root, 'gone', 'photo.png');

  assert.deepEqual(files.listImageSiblings(missing).entries, [path.resolve(missing)]);
});

test('moves a file into a destination folder', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'paneboard-files-'));
  const source = path.join(root, 'source.txt');
  fs.writeFileSync(source, 'moved');
  const folder = files.createFolder(root, 'dest-folder');

  const movedIntoFolder = files.moveItem(source, folder.path);
  assert.equal(movedIntoFolder.path, path.join(folder.path, 'source.txt'));
  assert.equal(fs.existsSync(source), false);
  assert.equal(fs.readFileSync(movedIntoFolder.path, 'utf8'), 'moved');
});

test('moving onto an existing file path overwrites it, and a missing destination throws', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'paneboard-files-'));
  const source = path.join(root, 'source.txt');
  const existing = path.join(root, 'existing.txt');
  fs.writeFileSync(source, 'new content');
  fs.writeFileSync(existing, 'old content');

  const moved = files.moveItem(source, existing);
  assert.equal(moved.path, path.resolve(existing));
  assert.equal(fs.readFileSync(existing, 'utf8'), 'new content');
  assert.equal(fs.existsSync(source), false);

  assert.throws(() => files.moveItem(existing, path.join(root, 'does-not-exist.txt')));
});

test('creating a folder or file that already exists throws', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'paneboard-files-'));
  files.createFolder(root, 'dup-folder');
  files.createFile(root, 'dup-file.txt');

  assert.throws(() => files.createFolder(root, 'dup-folder'));
  assert.throws(() => files.createFile(root, 'dup-file.txt'));
});

test('renaming rejects "." and ".." as the new name', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'paneboard-files-'));
  const target = path.join(root, 'note.txt');
  fs.writeFileSync(target, 'hi');

  assert.throws(() => files.renameItem(target, '.'), /Invalid file name/);
  assert.throws(() => files.renameItem(target, '..'), /Invalid file name/);
  assert.equal(fs.existsSync(target), true);
});

test('writeTextFile rejects directories, missing parents and oversized content', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'paneboard-files-'));
  const folder = files.createFolder(root, 'a-folder');

  assert.throws(() => files.writeTextFile(folder.path, 'x'), /not a file/i);
  assert.throws(() => files.writeTextFile(path.join(root, 'missing-parent', 'note.txt'), 'x'), /parent directory/i);

  const tooLarge = 'x'.repeat(10 * 1024 * 1024 + 1);
  assert.throws(() => files.writeTextFile(path.join(root, 'huge.txt'), tooLarge), /exceeds the 10 MB limit/);
});

test('readTextFile rejects files over the 10 MB limit', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'paneboard-files-'));
  const hugePath = path.join(root, 'huge.txt');
  fs.writeFileSync(hugePath, Buffer.alloc(10 * 1024 * 1024 + 1, 'x'));

  assert.throws(() => files.readTextFile(hugePath), /exceeds the 10 MB limit/);
});

test('reads and writes latin1 and UTF-16 BE text files', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'paneboard-files-'));
  const latin1Path = path.join(root, 'latin1.txt');
  const utf16bePath = path.join(root, 'utf16be.txt');

  files.writeTextFile(latin1Path, 'café', 'latin1');
  assert.deepEqual(textPayload(files.readTextFile(latin1Path)), { path: latin1Path, content: 'café', encoding: 'latin1' });

  files.writeTextFile(utf16bePath, '甲乙', 'utf16be');
  assert.deepEqual(textPayload(files.readTextFile(utf16bePath)), { path: utf16bePath, content: '甲乙', encoding: 'utf16be' });
});
