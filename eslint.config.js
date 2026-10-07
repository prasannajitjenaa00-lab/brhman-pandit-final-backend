const js = require('@eslint/js');
const globals = require('globals');

module.exports = [
  { ignores: ['node_modules', 'uploads', 'private_uploads'] },
  js.configs.recommended,
  {
    files: ['**/*.js'],
    languageOptions: { ecmaVersion: 2022, sourceType: 'commonjs', globals: globals.node },
    rules: { 'no-unused-vars': ['error', { argsIgnorePattern: '^_|^next$|^req$|^res$' }], 'no-console': 'error' },
  },
  { files: ['scripts/**/*.js'], rules: { 'no-console': 'off' } },
];
