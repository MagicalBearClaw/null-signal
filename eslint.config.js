import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';
import prettier from 'eslint-config-prettier';

export default tseslint.config(
  { ignores: ['dist', 'coverage', 'node_modules', 'public/assets'] },
  js.configs.recommended,
  ...tseslint.configs.strict,
  {
    languageOptions: {
      globals: { ...globals.browser },
    },
  },
  {
    // The simulation must stay renderer-agnostic: deterministic, testable in Node,
    // and replaceable view layers. See DESIGN.md §2.1.
    files: ['src/sim/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            { group: ['three', 'three/*'], message: 'src/sim must not import three.js (DESIGN.md §2.1).' },
            { group: ['**/render/**', '**/ui/**'], message: 'src/sim must not depend on render or ui.' },
          ],
        },
      ],
    },
  },
  prettier,
);
