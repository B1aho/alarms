/**
 * Dependency rules: TZ_ELECTRON.md §5.4. `npm run check` fails on any violation.
 * @type {import('dependency-cruiser').IConfiguration}
 */
module.exports = {
  allowedSeverity: 'error',
  allowed: [
    // contract: the message language, imports nothing else
    { from: { path: '^src/contract/' }, to: { path: '^src/contract/' } },
    // domain: pure rules
    { from: { path: '^src/domain/' }, to: { path: '^src/(domain|contract)/' } },
    // engine: the only journal writer; no electron
    { from: { path: '^src/engine/' }, to: { path: '^src/(engine|domain|contract)/' } },
    { from: { path: '^src/engine/' }, to: { dependencyTypes: ['core'], path: '^(node:)?(fs|path|crypto)$' } },
    // shell: OS integration; never the domain
    { from: { path: '^src/shell/' }, to: { path: '^src/(shell|contract)/' } },
    { from: { path: '^src/shell/' }, to: { dependencyTypes: ['core'] } },
    { from: { path: '^src/shell/' }, to: { path: '^node_modules/electron/' } },
    // preload: the bridge
    { from: { path: '^src/preload/' }, to: { path: '^src/contract/' } },
    { from: { path: '^src/preload/' }, to: { path: '^node_modules/electron/' } },
    // audio: sound only
    { from: { path: '^src/audio/' }, to: { path: '^src/(audio|contract)/' } },
    { from: { path: '^src/audio/' }, to: { path: '^src/domain/ramp[.]js$' } },
    // ui: window, MVU
    { from: { path: '^src/ui/' }, to: { path: '^src/(ui|contract)/' } },
    { from: { path: '^src/ui/' }, to: { path: '^src/domain/(format|strings|tasks|schedule)[.]js$' } },
  ],
  forbidden: [
    {
      name: 'no-node-in-renderer',
      comment: 'Renderers are sandboxed: no Node built-ins in ui/ and audio/.',
      severity: 'error',
      from: { path: '^src/(ui|audio)/' },
      to: { dependencyTypes: ['core'] },
    },
    {
      name: 'no-npm-in-pure-layers',
      comment: 'domain, ui and audio use no external npm packages.',
      severity: 'error',
      from: { path: '^src/(domain|ui|audio)/' },
      to: { dependencyTypes: ['npm', 'npm-dev', 'npm-optional', 'npm-peer', 'npm-bundled', 'npm-no-pkg', 'npm-unknown'] },
    },
    {
      name: 'no-electron-in-engine',
      severity: 'error',
      from: { path: '^src/engine/' },
      to: { path: '^node_modules/electron/' },
    },
    {
      name: 'no-domain-in-shell',
      severity: 'error',
      from: { path: '^src/shell/' },
      to: { path: '^src/domain/' },
    },
    {
      name: 'no-circular',
      severity: 'error',
      from: {},
      to: { circular: true },
    },
    {
      name: 'no-orphans',
      comment: 'Every module is reachable, except the process entry points.',
      severity: 'error',
      from: {
        orphan: true,
        pathNot: [
          '^src/shell/main[.]js$',
          '^src/engine/main[.]js$',
          '^src/preload/(ui|audio)[.]js$',
          '^src/audio/player[.]js$',
          '^src/ui/main[.]js$',
          '^src/ui/gallery[.]js$',
        ],
      },
      to: {},
    },
    {
      name: 'not-to-unresolvable',
      severity: 'error',
      from: {},
      to: { couldNotResolve: true },
    },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    moduleSystems: ['es6', 'cjs'],
    tsPreCompilationDeps: false,
    enhancedResolveOptions: { exportsFields: ['exports'], conditionNames: ['import', 'require', 'node', 'default'] },
  },
}
