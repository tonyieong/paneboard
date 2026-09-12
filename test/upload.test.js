const test = require('node:test');
const assert = require('node:assert/strict');
const { Readable } = require('node:stream');
const { createUploadParser } = require('../src/upload');

test('upload parser decodes utf8 filenames from browser multipart forms', async () => {
  const boundary = 'paneboard-boundary';
  const filename = '中文檔案.txt';
  const body = Buffer.from([
    `--${boundary}`,
    `Content-Disposition: form-data; name="files"; filename="${filename}"`,
    'Content-Type: text/plain',
    '',
    'hello',
    `--${boundary}--`,
    ''
  ].join('\r\n'), 'utf8');

  const parser = createUploadParser({
    'content-type': `multipart/form-data; boundary=${boundary}`
  }, 0);

  const seen = [];
  parser.on('file', (field, stream, info) => {
    seen.push(info.filename);
    stream.resume();
  });

  await new Promise((resolve, reject) => {
    parser.on('finish', resolve);
    parser.on('error', reject);
    Readable.from([body]).pipe(parser);
  });

  assert.deepEqual(seen, [filename]);
});
