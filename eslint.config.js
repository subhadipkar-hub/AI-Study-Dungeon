export default [
  {
    ignores: ["node_modules/**", "dist/**"]
  },
  {
    files: ["src/**/*.jsx"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      parserOptions: { ecmaFeatures: { jsx: true } },
      globals: { window: "readonly", document: "readonly", localStorage: "readonly", navigator: "readonly", fetch: "readonly", AbortController: "readonly", TextDecoder: "readonly", setTimeout: "readonly", clearTimeout: "readonly", console: "readonly", React: "readonly" }
    },
    rules: {}
  },
  {
    files: ["server/**/*.js", "vite.config.js", "tests/**/*.js", "src/lib/**/*.js"],
    languageOptions: { ecmaVersion: "latest", sourceType: "module", globals: { process: "readonly", console: "readonly", setTimeout: "readonly", clearTimeout: "readonly", fetch: "readonly", Date: "readonly", Map: "readonly", Set: "readonly", Math: "readonly", JSON: "readonly", Object: "readonly", Array: "readonly", Number: "readonly", String: "readonly", Error: "readonly" } },
    rules: {}
  }
];
