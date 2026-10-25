// lint-staged (Task 08): runs after the secret scan in .husky/pre-commit, on staged
// files only. LINT_IGNORES is the same list eslint.config.mjs uses; .prettierignore
// mirrors it for Prettier. The secret scan itself covers every staged file.
import path from 'node:path';
import { LINT_IGNORES } from './scripts/lint-scope.mjs';

const ignored = (file) => {
  const rel = path.relative(process.cwd(), file).split(path.sep).join('/');
  return LINT_IGNORES.some((pattern) => path.posix.matchesGlob(rel, pattern));
};
const keep = (files) => files.filter((file) => !ignored(file));
const quoted = (files) => files.map((file) => JSON.stringify(file)).join(' ');

export default {
  '*.{ts,mjs}': (files) => {
    const kept = keep(files);
    return kept.length === 0
      ? []
      : [`eslint --max-warnings=0 --no-warn-ignored ${quoted(kept)}`, `prettier --check ${quoted(kept)}`];
  },
  '*.{json,yml,yaml}': (files) => {
    const kept = keep(files);
    return kept.length === 0 ? [] : [`prettier --check --ignore-unknown ${quoted(kept)}`];
  },
};
