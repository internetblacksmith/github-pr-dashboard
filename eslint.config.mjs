export default [
  {
    files: ["*.js"],
    languageOptions: {
      ecmaVersion: 2020,
      sourceType: "script",
      globals: {
        // Browser
        window: "readonly",
        document: "readonly",
        console: "readonly",
        fetch: "readonly",
        AbortController: "readonly",
        setTimeout: "readonly",
        clearTimeout: "readonly",
        URL: "readonly",
        Date: "readonly",
        Promise: "readonly",
        JSON: "readonly",
        Math: "readonly",
        parseInt: "readonly",
        isNaN: "readonly",
        // Extension APIs
        chrome: "readonly",
        browser: "readonly",
        // Cross-script globals (loaded via script tags)
        t: "readonly",
        fetchUsername: "readonly",
        fetchDashboardData: "readonly",
        hasUnrespondedComments: "readonly",
        scorePr: "readonly",
      },
    },
    rules: {
      "no-undef": "error",
      "no-unused-vars": ["error", { vars: "local", caughtErrors: "none" }],
      eqeqeq: "error",
      "no-eval": "error",
    },
  },
  {
    ignores: ["test/", "node_modules/", "demo/", "demo-build/"],
  },
];
