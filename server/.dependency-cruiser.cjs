/**
 * dependency-cruiser rules for OUR OWN server code (not the product indexer, which
 * calls cruise() programmatically with explicit options and never reads this file).
 * Rule names are the ids used by .claude/skills/onion-architecture/SKILL.md.
 *
 * Run from the repo root (or server/); the config pins the CWD to server/, so the target is `src`:
 *   server/node_modules/.bin/depcruise --config server/.dependency-cruiser.cjs --ignore-known .dependency-cruiser-known-violations.json src
 * Known pre-existing violations: server/.dependency-cruiser-known-violations.json
 * (regenerate only deliberately, with depcruise-baseline).
 */
const path = require('node:path');
process.chdir(__dirname);

// Patterns tolerate both repo-root and server/ working directories.
const SRC = '(?:^|/)src/';
const MODULE_FILE = `${SRC}modules/[^/]+/`;
const REPOSITORY_FILES = [
  `${MODULE_FILE}repository\\.ts$`,
  `${SRC}modules/reviews/repository/[^/]+\\.repo\\.ts$`,
];
const DRIZZLE = 'node_modules/drizzle-orm';

/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: 'routes-no-infra',
      comment:
        'onion-architecture §1 rules 1-2: a route handler only translates HTTP. No adapters/, db/, drizzle-orm or repository.ts in routes.ts.',
      severity: 'error',
      from: { path: `${MODULE_FILE}routes\\.ts$` },
      to: {
        path: [
          `${SRC}adapters/`,
          `${SRC}db/`,
          DRIZZLE,
          `${SRC}modules/[^/]+/repository(?:\\.ts|/)`,
        ],
      },
    },
    {
      name: 'drizzle-only-in-repositories',
      comment:
        'onion-architecture §1 rule 3: SQL lives only in <m>/repository.ts and reviews/repository/*.repo.ts. Modules import drizzle-orm, db/schema, db/client only there.',
      severity: 'error',
      from: { path: `${SRC}modules/`, pathNot: REPOSITORY_FILES },
      to: { path: [DRIZZLE, `${SRC}db/(?:schema|client)(?:\\.ts|/)`] },
    },
    {
      name: 'adapters-no-core',
      comment:
        'onion-architecture §1 rule 5: adapters never import a service, repository, route or other module internals. A module constants.ts / types.ts (server-local ports) is fine.',
      severity: 'error',
      from: { path: `${SRC}adapters/` },
      to: {
        path: `${SRC}modules/`,
        pathNot: `${SRC}modules/[^/]+/(?:constants|types)\\.ts$`,
      },
    },
    {
      name: 'no-cross-module-internals',
      comment:
        "onion-architecture §1 rule 5: a module never imports another module's service.ts, repository.ts or routes.ts. Use Container getters. constants.ts / types.ts are fine.",
      severity: 'error',
      from: { path: `${SRC}modules/([^/]+)/` },
      to: {
        path: `${SRC}modules/[^/]+/(?:service|repository|routes)(?:\\.ts|/)`,
        pathNot: `${SRC}modules/$1/`,
      },
    },
    {
      name: 'domain-pure',
      comment:
        'onion-architecture §2: domain files (vendor/shared, <m>/helpers.ts, <m>/constants.ts, platform/errors.ts) hold no I/O: no platform/container, db/, adapters/, DB or vendor SDKs, node I/O modules.',
      severity: 'error',
      from: {
        path: [
          `${SRC}vendor/shared/`,
          `${MODULE_FILE}(?:helpers|constants)\\.ts$`,
          `${SRC}platform/errors\\.ts$`,
        ],
      },
      to: {
        path: [
          `${SRC}platform/container`,
          `${SRC}db/`,
          `${SRC}adapters/`,
          DRIZZLE,
          'node_modules/(?:simple-git|@octokit|openai|@anthropic-ai|pg|postgres)/',
        ],
        // db/rows.ts is a types-only file; the application and domain rings may import row types.
        pathNot: `${SRC}db/rows\\.ts$`,
      },
    },
    {
      name: 'domain-pure',
      comment: 'Same rule: node I/O core modules in domain files.',
      severity: 'error',
      from: {
        path: [
          `${SRC}vendor/shared/`,
          `${MODULE_FILE}(?:helpers|constants)\\.ts$`,
          `${SRC}platform/errors\\.ts$`,
        ],
      },
      to: {
        dependencyTypes: ['core'],
        path: '^(?:node:)?(?:fs|fs/promises|child_process|net|http|https|dns|tls|dgram|worker_threads)$',
      },
    },
    {
      name: 'no-circular',
      comment: 'Circular imports (type-only edges ignored).',
      severity: 'error',
      from: {},
      to: { circular: true, dependencyTypesNot: ['type-only'] },
    },
  ],
  options: {
    tsConfig: { fileName: path.join(__dirname, 'tsconfig.json') },
    tsPreCompilationDeps: true,
    doNotFollow: { path: 'node_modules' },
    exclude: { path: '(?:^|/)clones/' },
    enhancedResolveOptions: {
      exportsFields: ['exports'],
      conditionNames: ['import', 'require', 'node', 'default', 'types'],
      extensions: ['.ts', '.tsx', '.js', '.mjs', '.cjs', '.json'],
    },
    reporterOptions: { text: { highlightFocused: true } },
  },
};
