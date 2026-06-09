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
    ".next-build-check/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Generated/backend build output:
    "backend/dist/**",
    "backend/tsc_output.txt",
    // Local dependency/build/cache output:
    "node_modules/**",
    "backend/node_modules/**",
    "coverage/**",
    "pgsql_bin/**",
    // Local backup and debugging artifacts:
    "backup_*/**",
    ".codex-video-frames/**",
    "*.log",
    "*.txt",
    "debug*.json",
    "temp_*.json",
    "students_cols.json",
    "backend/*_schema.json",
    "backend/profiles_schema.json",
    "backend/nulls.json",
    // One-off local repair/diagnostic scripts are not application source.
    "scratch*.js",
    "check*.js",
    "fix*.js",
    "add_verses.js",
    "backup_data.js",
    "migrate-hifz.ts",
    "check-r263.ts",
    "fix-constraints.ts",
    "backend/*.js",
    "backend/*.ts",
  ]),
]);

export default eslintConfig;
