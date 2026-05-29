const js = require("@eslint/js");
const { FlatCompat } = require("@eslint/eslintrc");

const compat = new FlatCompat({
  baseDirectory: __dirname,
  resolvePluginsRelativeTo: __dirname,
  recommendedConfig: js.configs.recommended,
  allConfig: js.configs.all,
});

module.exports = [
  {
    ignores: [
      "eslint.config.js",
      "node_modules/**",
      "dist/**",
      "dist-electron/**",
      "out/**",
      ".vite/**",
      "*.db",
      "*.db-shm",
      "*.db-wal",
      "release/**",
      ".env",
      ".env.*",
      ".DS_Store",
      "Thumbs.db",
      ".vscode/**",
      ".idea/**",
      "*.log",
      "npm-debug.log*",
      "__pycache__/**",
      "*.pyc",
      "*.pyo",
      "resources/scripts/__pycache__/**",
    ],
  },
  ...compat.config({
    env: {
      browser: true,
      commonjs: true,
      es6: true,
      node: true,
    },
    parser: "@typescript-eslint/parser",
    parserOptions: {
      ecmaFeatures: {
        jsx: true,
      },
      sourceType: "module",
      ecmaVersion: 2021,
    },
    plugins: ["@typescript-eslint", "react-hooks", "prettier"],
    extends: ["plugin:@typescript-eslint/recommended", "plugin:prettier/recommended"],
    rules: {
      "@typescript-eslint/explicit-function-return-type": "off",
      "@typescript-eslint/no-empty-function": [
        "error",
        {
          allow: ["arrowFunctions", "asyncFunctions", "asyncMethods", "functions", "methods"],
        },
      ],
      "@typescript-eslint/no-empty-object-type": "off",
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
        },
      ],
      "prettier/prettier": "warn",
    },
  }),
];
