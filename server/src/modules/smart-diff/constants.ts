import type { SmartDiffRole } from '@devdigest/shared';

/** Group order of the smart-diff response: the substance first, the noise last. */
export const SMART_DIFF_ROLE_ORDER = ['core', 'tests', 'wiring', 'docs', 'boilerplate'] as const satisfies readonly SmartDiffRole[];

export interface RoleRule {
  role: Exclude<SmartDiffRole, 'core'>;
  patterns: readonly RegExp[];
}

/**
 * Path rules, in match order: the first rule set with a matching pattern wins
 * (boilerplate → tests → wiring → docs); no match means `core`.
 * A directory name matches as a path segment at any depth; matching is case-sensitive.
 */
export const ROLE_RULES: readonly RoleRule[] = [
  {
    role: 'boilerplate',
    patterns: [
      /\.lock$/,
      /(^|\/)pnpm-lock\.yaml$/,
      /(^|\/)package-lock\.json$/,
      /(^|\/)yarn\.lock$/,
      /(^|\/)dist\//,
      /(^|\/)build\//,
      /(^|\/)__snapshots__\//,
      /\.snap$/,
      /\.generated\.[^/]+$/,
      /\.min\.js$/,
    ],
  },
  {
    role: 'tests',
    patterns: [
      /\.test\.tsx?$/,
      /\.it\.test\.ts$/,
      /\.spec\.ts$/,
      /(^|\/)test\//,
      /(^|\/)tests\//,
      /(^|\/)__tests__\//,
      /(^|\/)e2e\//,
    ],
  },
  {
    role: 'wiring',
    patterns: [
      /(^|\/)index\.(ts|js)$/,
      /(^|\/)[^/]*\.config\.[^/]+$/,
      /(^|\/)tsconfig[^/]*\.json$/,
      /(^|\/)\.eslintrc[^/]*$/,
      /(^|\/)\.env[^/]*$/,
      /(^|\/)docker-compose[^/]*\.yml$/,
      /(^|\/)\.github\//,
      /(^|\/)\.claude\//,
    ],
  },
  {
    role: 'docs',
    patterns: [/\.md$/, /(^|\/)docs\//, /(^|\/)README[^/]*$/, /(^|\/)CHANGELOG[^/]*$/, /(^|\/)LICENSE$/],
  },
];
