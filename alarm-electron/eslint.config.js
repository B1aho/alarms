import js from '@eslint/js'
import globals from 'globals'

const impure = [
  { object: 'Date', property: 'now', message: 'domain is pure: pass `now` in.' },
  { object: 'Math', property: 'random', message: 'domain is pure: pass `rng` in.' },
  { object: 'performance', property: 'now', message: 'domain is pure: pass `now` in.' },
  { object: 'crypto', property: 'randomUUID', message: 'domain is pure: pass `rng` in.' },
]

export default [
  { ignores: ['node_modules/**', 'dist/**', 'test-results/**', 'playwright-report/**', 'src/contract/schemas/validators.js'] },
  js.configs.recommended,
  {
    languageOptions: { ecmaVersion: 2023, sourceType: 'module', globals: { ...globals.node } },
    rules: {
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none' }],
      eqeqeq: ['error', 'always'],
      'prefer-const': 'error',
    },
  },
  {
    files: ['src/ui/**/*.js', 'src/audio/**/*.js'],
    languageOptions: { globals: { ...globals.browser } },
  },
  {
    files: ['src/preload/**/*.js'],
    languageOptions: { sourceType: 'commonjs', globals: { ...globals.node } },
  },
  {
    files: ['src/domain/**/*.js'],
    languageOptions: { globals: {} },
    rules: {
      'no-restricted-properties': ['error', ...impure],
      'no-restricted-globals': [
        'error',
        { name: 'setTimeout', message: 'domain is pure.' },
        { name: 'setInterval', message: 'domain is pure.' },
        { name: 'fetch', message: 'domain is pure.' },
        { name: 'process', message: 'domain is pure.' },
        { name: 'console', message: 'domain is pure.' },
        { name: 'window', message: 'domain is pure.' },
        { name: 'document', message: 'domain is pure.' },
        { name: 'localStorage', message: 'domain is pure.' },
      ],
      'no-restricted-syntax': [
        'error',
        { selector: "NewExpression[callee.name='Date'][arguments.length=0]", message: 'domain is pure: `new Date()` reads the clock.' },
      ],
    },
  },
]
