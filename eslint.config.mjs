// ESLint v9 flat config — lenient (just catch genuine bugs, not stylistic noise).
// TypeScript already catches most issues; ESLint is here for runtime patterns
// TS can't see (hook deps, unused vars, react gotchas).
import js from "@eslint/js";
import tseslint from "@typescript-eslint/eslint-plugin";
import tsparser from "@typescript-eslint/parser";
import reactHooks from "eslint-plugin-react-hooks";
import prettier from "eslint-config-prettier";

export default [
  {
    ignores: [
      "**/node_modules/**", "**/dist/**", "**/build/**", "**/.git/**",
      "**/*.d.ts", "packages/shared/dist/**", "tools/**",
      // JS-only files that need their own globals (service worker, smoketest)
      "**/sw.js", "**/registerSW.js", "**/smoketest.mjs",
      "**/public/**", "**/.audit/**",
      "**/postcss.config.js", "**/tailwind.config.js",
      "**/scripts/**", "**/*.config.{js,mjs,cjs,ts}",
    ],
  },
  js.configs.recommended,
  {
    files: ["**/*.ts", "**/*.tsx"],
    languageOptions: {
      parser: tsparser,
      ecmaVersion: "latest",
      sourceType: "module",
      parserOptions: { ecmaFeatures: { jsx: true } },
      globals: {
        window: "readonly", document: "readonly", console: "readonly",
        setTimeout: "readonly", clearTimeout: "readonly",
        setInterval: "readonly", clearInterval: "readonly",
        performance: "readonly", localStorage: "readonly",
        navigator: "readonly", fetch: "readonly", URL: "readonly",
        Event: "readonly", CustomEvent: "readonly", KeyboardEvent: "readonly",
        MouseEvent: "readonly", HTMLElement: "readonly", HTMLCanvasElement: "readonly",
        HTMLInputElement: "readonly", CanvasRenderingContext2D: "readonly",
        WebSocket: "readonly", crypto: "readonly", Blob: "readonly",
        process: "readonly", Buffer: "readonly", NodeJS: "readonly", global: "readonly",
        ResizeObserver: "readonly", IntersectionObserver: "readonly",
        CSS: "readonly", confirm: "readonly", alert: "readonly", prompt: "readonly",
        URLSearchParams: "readonly", FormData: "readonly", File: "readonly",
        location: "readonly", history: "readonly", structuredClone: "readonly",
        requestAnimationFrame: "readonly", cancelAnimationFrame: "readonly",
        matchMedia: "readonly", innerWidth: "readonly", innerHeight: "readonly",
        Image: "readonly", AudioContext: "readonly", OscillatorNode: "readonly",
        Promise: "readonly", Map: "readonly", Set: "readonly", Symbol: "readonly",
        Int8Array: "readonly", Uint8Array: "readonly", Uint32Array: "readonly",
        Float32Array: "readonly", ArrayBuffer: "readonly", DataView: "readonly",
        TextEncoder: "readonly", TextDecoder: "readonly",
        atob: "readonly", btoa: "readonly", queueMicrotask: "readonly",
      },
    },
    plugins: {
      "@typescript-eslint": tseslint,
      "react-hooks": reactHooks,
    },
    rules: {
      ...prettier.rules,
      // Disable base rule, defer to TS
      "no-unused-vars": "off",
      "no-undef": "off",  // TS handles this
      "no-empty": ["warn", { allowEmptyCatch: true }],
      "no-useless-assignment": "off",
      "no-unused-private-class-members": "off",
      "no-fallthrough": "off",
      "no-constant-binary-expression": "off",
      "no-useless-escape": "off",
      "no-cond-assign": "off",
      "no-prototype-builtins": "off",
      "no-irregular-whitespace": "off",
      "no-control-regex": "off",
      "no-self-assign": "off",
      "no-misleading-character-class": "off",
      "no-constant-condition": ["warn", { checkLoops: false }],
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "off",  // too noisy without per-component tuning
    },
  },
  {
    // Test files: relax further
    files: ["**/*.test.ts", "**/*.test.tsx", "**/__tests__/**"],
    rules: {
      "no-empty": "off",
    },
  },
];
