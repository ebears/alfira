import { defineConfig } from 'oxfmt';

export default defineConfig({
  ignorePatterns: ['dist/**', '**/public/**', '**/*.webmanifest', '.cache/**'],
  printWidth: 100,
  tabWidth: 2,
  useTabs: false,
  semi: true,
  singleQuote: true,
  jsxSingleQuote: true,
  trailingComma: 'es5',
  bracketSpacing: true,
  bracketSameLine: false,
  arrowParens: 'always',
  quoteProps: 'as-needed',
  insertFinalNewline: true,
});
