// Commit messages follow Conventional Commits: "feat(db): add document numbers", "fix: …", "docs: …".
export default {
  extends: ["@commitlint/config-conventional"],
  rules: {
    // Long URLs and command output in bodies are fine.
    "body-max-line-length": [0],
    "footer-max-line-length": [0],
    // The owner's rule: no co-author trailers on commits in this repo.
    "trailer-exists": [2, "never", "Co-Authored-By:"],
  },
};
