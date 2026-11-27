/**
 * dependency-cruiser rules for the client (@devdigest/web), from
 * .claude/skills/client-layout/SKILL.md. Uses the server's depcruise binary.
 *
 * Run from the repo root (or client/); the config pins the CWD to client/, so the target is `src`:
 *   server/node_modules/.bin/depcruise --config client/.dependency-cruiser.cjs \
 *     --ignore-known .dependency-cruiser-known-violations.json src
 */
const fs = require('node:fs');
const path = require('node:path');

// tsconfig `paths` (no baseUrl) resolve against the CWD, so @devdigest/* and @/* stay unresolved unless
// CWD is this package. Pin it: the config then works from the repo root and from the package alike.
// Consequence: pass paths relative to the package (`src`), not `client/src`.
process.chdir(__dirname);

const SRC = '(?:^|/)src/';
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Every `_components` folder under src/app (route-level and nested), as repo-relative-agnostic dir paths below `src/`. */
function componentDirs(dir, rel = 'src/app', out = []) {
  let entries = [];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    if (!e.isDirectory() || e.name === 'node_modules') continue;
    const childRel = `${rel}/${e.name}`;
    if (e.name === '_components') out.push(rel);
    componentDirs(path.join(dir, e.name), childRel, out);
  }
  return out;
}

// One rule instance per owner folder X of an X/_components/: only files under X/ may import X/_components/**.
// Generated from the file system on every run, so new routes need no config change.
const crossRoute = componentDirs(path.join(__dirname, 'src', 'app')).map((owner) => ({
  name: 'no-cross-route-components',
  comment:
    "client-layout §2/§8: a route never imports another route's _components/ (promote to src/components/ instead). Children of one _components/ may import siblings through ../<Sibling>.",
  severity: 'error',
  from: { pathNot: `(?:^|/)${escapeRe(owner)}/` },
  to: { path: `(?:^|/)${escapeRe(owner)}/_components/` },
}));


/** Parent folders whose children are component folders: every `_components` dir and src/components. */
function componentParents(dir, rel = 'src/app', out = []) {
  let entries = [];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    if (!e.isDirectory() || e.name === 'node_modules') continue;
    const childRel = `${rel}/${e.name}`;
    if (e.name === '_components') out.push(childRel);
    componentParents(path.join(dir, e.name), childRel, out);
  }
  return out;
}

// A relative (non-aliased) import from a file inside <parent>/<Name>/ must resolve under <parent>/
// (own folder, or a sibling through ../<Sibling>). Anything else needed ../../ or deeper: use @/.
// Approximation on resolved paths: depcruise rules cannot see the raw specifier.
const climbOut = [path.join('src', 'components'), ...componentParents(path.join(__dirname, 'src', 'app'))]
  .map((p) => p.split(path.sep).join('/'))
  .map((parent) => ({
    name: 'no-climb-out-of-component-folder',
    comment:
      'client-layout §4: never climb out of a component folder with ../../ ; use @/. Approximation: a relative import from <parent>/<Name>/** must stay under <parent>/.',
    severity: 'error',
    from: { path: `(?:^|/)${escapeRe(parent)}/[^/]+/` },
    to: {
      dependencyTypes: ['local'],
      dependencyTypesNot: ['aliased', 'aliased-tsconfig', 'aliased-tsconfig-paths'],
      pathNot: `(?:^|/)${escapeRe(parent)}/`,
    },
  }));

/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    ...crossRoute,
    {
      name: 'no-app-import-from-shared-zones',
      comment: 'client-layout §4: src/components/ and src/lib/ never import from src/app/.',
      severity: 'error',
      from: { path: `${SRC}(?:components|lib)/` },
      to: { path: `${SRC}app/` },
    },
    ...climbOut,
    {
      name: 'contracts-via-shared-alias',
      comment: 'client-layout §4: contracts only from @devdigest/shared, never a relative path into src/vendor/shared.',
      severity: 'error',
      from: { pathNot: `${SRC}vendor/shared/` },
      to: {
        path: `${SRC}vendor/shared/`,
        dependencyTypesNot: ['aliased-tsconfig-paths'],
      },
    },
  ],
  options: {
    tsConfig: { fileName: path.join(__dirname, 'tsconfig.json') },
    tsPreCompilationDeps: true,
    doNotFollow: { path: 'node_modules' },
    exclude: { path: ['(?:^|/)node_modules/', '(?:^|/)\\.next/'] },
    enhancedResolveOptions: {
      exportsFields: ['exports'],
      conditionNames: ['import', 'require', 'node', 'default', 'types'],
      extensions: ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.json'],
    },
  },
};
