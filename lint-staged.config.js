// Runs on the files staged for a commit (via the husky pre-commit hook).
export default {
  // TypeScript in packages: format, then fix lint problems with that package's own ESLint config.
  "packages/**/*.{ts,tsx}": ["prettier --write", "eslint --fix"],
  "apps/**/*.{ts,tsx}": ["prettier --write", "eslint --fix"],
  // Everything else Prettier understands.
  "*.{js,mjs,cjs,json,md,yml,yaml,css}": ["prettier --write --ignore-unknown"],
};
