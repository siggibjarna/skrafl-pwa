import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist/**', '.cache/**', 'node_modules/**', 'public/**'] },
  ...tseslint.configs.recommended,
);
