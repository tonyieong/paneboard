const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { spawn, spawnSync } = require('child_process');
const { pipeline } = require('stream/promises');

function normalizeLocalPath(value) {
  const input = String(value || '').trim();
  if (!input || input.startsWith('\\\\')) {
    return null;
  }
  const parsed = path.win32.parse(input);
  if (!/^[A-Za-z]:\\?$/.test(parsed.root)) {
    return null;
  }
  const resolved = path.win32.resolve(input);
  if (!resolved.toLowerCase().startsWith(parsed.root.toLowerCase())) {
    return null;
  }
  return resolved;
}

function assertLocalPath(value) {
  const normalized = normalizeLocalPath(value);
  if (!normalized) {
    const error = new Error('Invalid local path.');
    error.statusCode = 400;
    throw error;
  }
  return normalized;
}

function listDrives() {
  const drives = [];
  for (let code = 65; code <= 90; code += 1) {
    const root = `${String.fromCharCode(code)}:\\`;
    try {
      fs.accessSync(root);
      drives.push({ name: root, path: root });
    } catch (error) {
      // Drive is not mounted or not accessible.
    }
  }
  return drives;
}

function fileInfo(filePath, name, hidden = false) {
  const stat = fs.statSync(filePath);
  const displayName = name || path.win32.basename(filePath);
  return {
    name: displayName,
    path: filePath,
    type: stat.isDirectory() ? 'directory' : 'file',
    size: stat.isDirectory() ? 0 : stat.size,
    modifiedAt: stat.mtime.toISOString(),
    hidden: hidden || displayName.startsWith('.')
  };
}

function hiddenLocalPaths(dir) {
  const hidden = new Set();
  try {
    const result = spawnSync('attrib.exe', [path.win32.join(dir, '*'), '/D'], {
      encoding: 'utf8',
      windowsHide: true
    });
    for (const line of String(result.stdout || '').split(/\r?\n/)) {
      if (line.length >= 22 && line.slice(0, 21).includes('H')) {
        hidden.add(path.win32.resolve(line.slice(21).trim()).toLowerCase());
      }
    }
  } catch (error) {
    // Dot-prefixed files are still detected when attrib.exe is unavailable.
  }
  return hidden;
}

function listDirectory(targetPath) {
  const dir = assertLocalPath(targetPath);
  const stat = fs.statSync(dir);
  if (!stat.isDirectory()) {
    const error = new Error('Path is not a directory.');
    error.statusCode = 400;
    throw error;
  }
  const hidden = hiddenLocalPaths(dir);
  const entries = fs.readdirSync(dir).map((name) => {
    try {
      const entryPath = path.win32.join(dir, name);
      return fileInfo(entryPath, name, hidden.has(path.win32.resolve(entryPath).toLowerCase()));
    } catch (error) {
      return null;
    }
  }).filter(Boolean);
  entries.sort((a, b) => {
    if (a.type !== b.type) {
      return a.type === 'directory' ? -1 : 1;
    }
    return a.name.localeCompare(b.name);
  });
  return { path: dir, parent: parentPath(dir), entries };
}

function parentPath(targetPath) {
  const parsed = path.win32.parse(targetPath);
  if (targetPath.toLowerCase() === parsed.root.toLowerCase()) {
    return '';
  }
  return path.win32.dirname(targetPath);
}

function safeChildPath(parent, name) {
  const dir = assertLocalPath(parent);
  const cleanName = path.win32.basename(String(name || '').trim());
  if (!cleanName || cleanName === '.' || cleanName === '..') {
    const error = new Error('Invalid file name.');
    error.statusCode = 400;
    throw error;
  }
  return path.win32.join(dir, cleanName);
}

function createFolder(parent, name) {
  const folderPath = safeChildPath(parent, name);
  fs.mkdirSync(folderPath);
  return fileInfo(folderPath);
}

function createFile(parent, name) {
  const filePath = safeChildPath(parent, name);
  fs.writeFileSync(filePath, '', { flag: 'wx' });
  return fileInfo(filePath);
}

const MAX_TEXT_FILE_BYTES = 10 * 1024 * 1024;

function readTextFile(targetPath) {
  const target = assertLocalPath(targetPath);
  const stat = fs.statSync(target);
  if (!stat.isFile()) {
    const error = new Error('Path is not a file.');
    error.statusCode = 400;
    throw error;
  }
  if (stat.size > MAX_TEXT_FILE_BYTES) {
    const error = new Error('Text file exceeds the 10 MB limit.');
    error.statusCode = 413;
    throw error;
  }
  const buffer = fs.readFileSync(target);
  let content;
  let encoding;
  if (buffer.subarray(0, 3).equals(Buffer.from([0xef, 0xbb, 0xbf]))) {
    content = buffer.subarray(3).toString('utf8');
    encoding = 'utf8-bom';
  } else if (buffer.subarray(0, 2).equals(Buffer.from([0xff, 0xfe]))) {
    content = buffer.subarray(2).toString('utf16le');
    encoding = 'utf16le';
  } else if (buffer.subarray(0, 2).equals(Buffer.from([0xfe, 0xff]))) {
    const swapped = Buffer.from(buffer.subarray(2));
    swapped.swap16();
    content = swapped.toString('utf16le');
    encoding = 'utf16be';
  } else {
    if (buffer.includes(0)) {
      const error = new Error('Binary files cannot be opened in Notepad.');
      error.statusCode = 415;
      throw error;
    }
    try {
      content = new TextDecoder('utf-8', { fatal: true }).decode(buffer);
      encoding = 'utf8';
    } catch (error) {
      content = buffer.toString('latin1');
      encoding = 'latin1';
    }
  }
  return { path: target, content, encoding, mtimeMs: stat.mtimeMs, size: stat.size };
}

// A notepad tab polls this to notice that another program rewrote the file it
// has open. Only the stamp travels, so the check stays cheap even for the 10 MB
// files readTextFile still accepts.
function fileStamp(targetPath) {
  const target = assertLocalPath(targetPath);
  const stat = fs.statSync(target);
  if (!stat.isFile()) {
    const error = new Error('Path is not a file.');
    error.statusCode = 400;
    throw error;
  }
  return { path: target, mtimeMs: stat.mtimeMs, size: stat.size };
}

function writeTextFile(targetPath, content, encoding = 'utf8') {
  const target = assertLocalPath(targetPath);
  if (fs.existsSync(target) && fs.statSync(target).isDirectory()) {
    const error = new Error('Path is not a file.');
    error.statusCode = 400;
    throw error;
  }
  if (!fs.existsSync(path.win32.dirname(target))) {
    const error = new Error('Parent directory does not exist.');
    error.statusCode = 400;
    throw error;
  }
  const value = String(content ?? '');
  let buffer;
  if (encoding === 'utf8-bom') {
    buffer = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(value, 'utf8')]);
  } else if (encoding === 'utf16le') {
    buffer = Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(value, 'utf16le')]);
  } else if (encoding === 'utf16be') {
    const body = Buffer.from(value, 'utf16le');
    body.swap16();
    buffer = Buffer.concat([Buffer.from([0xfe, 0xff]), body]);
  } else if (encoding === 'latin1') {
    buffer = Buffer.from(value, 'latin1');
  } else {
    buffer = Buffer.from(value, 'utf8');
  }
  if (buffer.length > MAX_TEXT_FILE_BYTES) {
    const error = new Error('Text file exceeds the 10 MB limit.');
    error.statusCode = 413;
    throw error;
  }
  fs.writeFileSync(target, buffer);
  return readTextFile(target);
}

function renameItem(targetPath, name) {
  const from = assertLocalPath(targetPath);
  const to = safeChildPath(path.win32.dirname(from), name);
  fs.renameSync(from, to);
  return fileInfo(to);
}

function moveItem(targetPath, destinationPath) {
  const from = assertLocalPath(targetPath);
  const destination = assertLocalPath(destinationPath);
  const stat = fs.statSync(destination);
  const to = stat.isDirectory() ? path.win32.join(destination, path.win32.basename(from)) : destination;
  fs.renameSync(from, to);
  return fileInfo(to);
}

function copyItem(targetPath, destinationPath) {
  const from = assertLocalPath(targetPath);
  const destination = assertLocalPath(destinationPath);
  const stat = fs.statSync(destination);
  const targetDir = stat.isDirectory() ? destination : path.win32.dirname(destination);
  const to = uniqueChildPath(targetDir, path.win32.basename(from));
  fs.cpSync(from, to, { recursive: true });
  return fileInfo(to);
}

function deleteItem(targetPath) {
  const target = assertLocalPath(targetPath);
  const stat = fs.statSync(target);
  if (stat.isDirectory()) {
    fs.rmSync(target, { recursive: true });
  } else {
    fs.unlinkSync(target);
  }
  return { ok: true };
}

function deleteItems(paths) {
  const list = Array.isArray(paths) ? paths : [];
  const results = list.map((item) => {
    try {
      const target = assertLocalPath(item);
      deleteItem(target);
      return { path: target, ok: true };
    } catch (error) {
      return { path: String(item || ''), ok: false, error: error.message };
    }
  });
  return { results };
}

function uniqueChildPath(parent, name) {
  const ext = path.win32.extname(name);
  const base = path.win32.basename(name, ext);
  let candidate = safeChildPath(parent, name);
  let index = 1;
  while (fs.existsSync(candidate)) {
    candidate = safeChildPath(parent, `${base} (${index})${ext}`);
    index += 1;
  }
  return candidate;
}

function repairMojibakeFilename(name) {
  const value = String(name || '');
  if (!/[\u0080-\u009fÃÂãäåæçèé]/.test(value)) {
    return value;
  }
  const repaired = Buffer.from(value, 'latin1').toString('utf8');
  if (!repaired || repaired.includes('\uFFFD') || repaired === value) {
    return value;
  }
  return repaired;
}

async function saveUploadedFile(parent, name, stream) {
  const dir = assertLocalPath(parent);
  const repaired = repairMojibakeFilename(name || 'upload.bin').replace(/\//g, '\\');
  const parts = repaired.split('\\').filter(Boolean);
  if (!parts.length || parts.some((part) => part === '.' || part === '..' || path.win32.basename(part) !== part)) {
    const error = new Error('Invalid file name.');
    error.statusCode = 400;
    throw error;
  }
  const uploadParent = parts.length > 1 ? path.win32.join(dir, ...parts.slice(0, -1)) : dir;
  const normalizedParent = path.win32.resolve(uploadParent);
  const rootPrefix = dir.endsWith('\\') ? dir.toLowerCase() : `${dir.toLowerCase()}\\`;
  if (normalizedParent.toLowerCase() !== dir.toLowerCase() && !normalizedParent.toLowerCase().startsWith(rootPrefix)) {
    const error = new Error('Invalid file name.');
    error.statusCode = 400;
    throw error;
  }
  fs.mkdirSync(normalizedParent, { recursive: true });
  const target = uniqueChildPath(normalizedParent, parts.at(-1));
  await pipeline(stream, fs.createWriteStream(target));
  return fileInfo(target);
}

const IMAGE_CONTENT_TYPES = new Map([
  ['.avif', 'image/avif'],
  ['.bmp', 'image/bmp'],
  ['.gif', 'image/gif'],
  ['.ico', 'image/x-icon'],
  ['.jpeg', 'image/jpeg'],
  ['.jpg', 'image/jpeg'],
  ['.png', 'image/png'],
  ['.svg', 'image/svg+xml'],
  ['.webp', 'image/webp']
]);

function imageContentType(value) {
  return IMAGE_CONTENT_TYPES.get(path.win32.extname(String(value || '')).toLowerCase()) || '';
}

function imageInfo(targetPath) {
  const target = assertLocalPath(targetPath);
  const contentType = imageContentType(target);
  if (!contentType) {
    const error = new Error('File is not a supported image.');
    error.statusCode = 415;
    throw error;
  }
  const stat = fs.statSync(target);
  if (!stat.isFile()) {
    const error = new Error('Path is not a file.');
    error.statusCode = 400;
    throw error;
  }
  return {
    path: target,
    name: path.win32.basename(target),
    size: stat.size,
    modifiedAt: stat.mtime.toISOString(),
    contentType
  };
}

function listImageSiblings(targetPath) {
  const target = assertLocalPath(targetPath);
  const directory = path.win32.dirname(target);
  let names;
  try {
    names = fs.readdirSync(directory).filter((name) => imageContentType(name));
  } catch (error) {
    // An unreadable directory still lets the requested image be viewed alone.
    names = [];
  }
  names.sort((a, b) => a.localeCompare(b));
  const entries = names.map((name) => path.win32.join(directory, name));
  if (!entries.some((entry) => entry.toLowerCase() === target.toLowerCase())) {
    entries.unshift(target);
  }
  return { path: target, directory, entries };
}

function downloadInfo(targetPath) {
  const target = assertLocalPath(targetPath);
  const stat = fs.statSync(target);
  if (!stat.isFile() && !stat.isDirectory()) {
    const error = new Error('Path is not a file.');
    error.statusCode = 400;
    throw error;
  }
  return {
    path: target,
    name: path.win32.basename(target),
    size: stat.isFile() ? stat.size : 0,
    type: stat.isDirectory() ? 'directory' : 'file'
  };
}

function prepareDownload(targetPath) {
  const download = downloadInfo(targetPath);
  if (download.type === 'file') {
    return Promise.resolve(download);
  }
  const archivePath = path.join(os.tmpdir(), `wps7-${crypto.randomUUID()}.zip`);
  const script = 'Compress-Archive -LiteralPath $env:WPS7_ARCHIVE_SOURCE -DestinationPath $env:WPS7_ARCHIVE_TARGET -Force';
  return new Promise((resolve, reject) => {
    const child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], {
      windowsHide: true,
      env: {
        ...process.env,
        WPS7_ARCHIVE_SOURCE: download.path,
        WPS7_ARCHIVE_TARGET: archivePath
      }
    });
    let stderr = '';
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code !== 0 || !fs.existsSync(archivePath)) {
        reject(new Error(stderr.trim() || 'Could not create folder archive.'));
        return;
      }
      resolve({
        path: archivePath,
        name: `${download.name}.zip`,
        size: fs.statSync(archivePath).size,
        type: 'archive',
        temporary: true
      });
    });
  });
}

function prepareBulkDownload(paths) {
  const list = (Array.isArray(paths) ? paths : []).map((item) => assertLocalPath(item));
  if (!list.length) {
    const error = new Error('No files selected for download.');
    error.statusCode = 400;
    throw error;
  }
  if (list.length === 1) {
    return prepareDownload(list[0]);
  }
  for (const item of list) {
    fs.statSync(item);
  }
  const archivePath = path.join(os.tmpdir(), `wps7-${crypto.randomUUID()}.zip`);
  const script = '$sources = $env:WPS7_ARCHIVE_SOURCE -split "`n" | Where-Object { $_ }; Compress-Archive -LiteralPath $sources -DestinationPath $env:WPS7_ARCHIVE_TARGET -Force';
  return new Promise((resolve, reject) => {
    const child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], {
      windowsHide: true,
      env: {
        ...process.env,
        WPS7_ARCHIVE_SOURCE: list.join('\n'),
        WPS7_ARCHIVE_TARGET: archivePath
      }
    });
    let stderr = '';
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code !== 0 || !fs.existsSync(archivePath)) {
        reject(new Error(stderr.trim() || 'Could not create archive.'));
        return;
      }
      resolve({
        path: archivePath,
        name: 'wps7-files.zip',
        size: fs.statSync(archivePath).size,
        type: 'archive',
        temporary: true
      });
    });
  });
}

module.exports = {
  createFolder,
  createFile,
  copyItem,
  deleteItem,
  deleteItems,
  downloadInfo,
  fileStamp,
  imageContentType,
  imageInfo,
  listDirectory,
  listDrives,
  listImageSiblings,
  moveItem,
  normalizeLocalPath,
  prepareBulkDownload,
  prepareDownload,
  repairMojibakeFilename,
  readTextFile,
  renameItem,
  saveUploadedFile,
  writeTextFile
};
