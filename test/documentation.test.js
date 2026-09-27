const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const packageJson = require('../package.json');

const root = path.join(__dirname, '..');

test('release documentation is complete and contains no generation markers', () => {
  const changelog = fs.readFileSync(path.join(root, 'CHANGELOG.md'), 'utf8');
  assert.match(changelog, new RegExp(`^## \\[${packageJson.version.replaceAll('.', '\\.')}\\] - `, 'm'));
  assert.doesNotMatch(changelog, /<\/(?:content|invoke)>/);
});

test('local Markdown images exist', () => {
  const markdownFiles = [
    'README.md',
    'README.zh-TW.md',
    'docs/design-concept.md'
  ];
  for (const relativeFile of markdownFiles) {
    const file = path.join(root, relativeFile);
    const source = fs.readFileSync(file, 'utf8');
    const targets = [
      ...source.matchAll(/!\[[^\]]*\]\(([^ )]+)(?:\s+[^)]*)?\)/g),
      ...source.matchAll(/<img\s+[^>]*src="([^"]+)"/g)
    ].map((match) => match[1]);
    for (const target of targets) {
      if (/^(?:https?:|data:)/.test(target)) continue;
      const resolved = path.resolve(path.dirname(file), target);
      assert.ok(fs.existsSync(resolved), `${relativeFile} references missing image ${target}`);
    }
  }
});

test('the bug form links directly to the private security instructions', () => {
  const form = fs.readFileSync(path.join(root, '.github', 'ISSUE_TEMPLATE', 'bug_report.yml'), 'utf8');
  assert.match(form, /https:\/\/github\.com\/tonyieong\/paneboard\/blob\/main\/SECURITY\.md/);
});
