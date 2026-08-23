const js = require('@eslint/js');
const globals = require('globals');

// Tuned to the conventions this codebase already follows, so the linter reports
// real defects instead of asking for a rewrite of working code.
const rules = {
  ...js.configs.recommended.rules,
  // Empty catch blocks here are deliberate and carry a comment explaining why.
  'no-empty': ['error', { allowEmptyCatch: true }],
  // `catch (error)` without using `error` is the house style, and destructuring
  // with a rest element is how fields get omitted from persisted state. Kept at
  // warn so pre-existing dead code stays visible without blocking CI.
  'no-unused-vars': ['warn', { caughtErrors: 'none', ignoreRestSiblings: true }],
  // A terminal emulator parses ANSI and C0 control characters for a living.
  'no-control-regex': 'off',
  // Retrofitting `cause` onto every rethrow would change the errors callers
  // already match on. Worth doing deliberately, not as a lint fix.
  'preserve-caught-error': 'off'
};

module.exports = [
  {
    ignores: [
      'node_modules/**',
      'dist/**',
      'data/**',
      'tools/**',
      // Pre-built third-party bundles are not ours to lint.
      'public/vendor/**'
    ]
  },
  {
    files: ['src/**/*.js', 'scripts/**/*.js', 'test/**/*.js', 'plugin-panes/*/server.js', 'eslint.config.js'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'commonjs',
      globals: globals.node
    },
    rules
  },
  {
    files: ['public/**/*.js', 'plugin-panes/*/client.js'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'script',
      globals: {
        ...globals.browser,
        ...globals.serviceworker,
        // Loaded as globals from public/vendor/xterm by index.html.
        Terminal: 'readonly',
        FitAddon: 'readonly'
      }
    },
    rules
  }
];
