import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Third-party Claude Code skill content (docs/modules/design-stack.md) —
    // vendored as-is so it stays diffable against upstream; not part of the
    // app's own source or build.
    ".claude/skills/**",
    // Vendored alongside the skills above, same reason.
    "scripts/design-audit.mjs",
  ]),
]);

export default eslintConfig;
