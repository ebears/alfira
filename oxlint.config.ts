import { defineConfig } from 'oxlint';

export default defineConfig({
  plugins: ['react', 'jsx-a11y', 'typescript'],

  rules: {
    // a11y
    'react/button-has-type': 'error',
    'jsx-a11y/no-static-element-interactions': 'warn',
    'jsx-a11y/click-events-have-key-events': 'warn',

    // complexity
    'no-extra-boolean-cast': 'error',
    'no-useless-catch': 'error',
    '@typescript-eslint/no-this-alias': 'error',
    '@typescript-eslint/no-unnecessary-type-constraint': 'error',

    // correctness
    'no-const-assign': 'error',
    'no-constant-condition': 'warn',
    'no-empty-character-class': 'error',
    'no-empty-pattern': 'error',
    'no-obj-calls': 'error',
    'constructor-super': 'error',
    'no-self-assign': 'error',
    'no-setter-return': 'error',
    'no-unreachable': 'error',
    'no-unsafe-finally': 'error',
    'no-unused-labels': 'error',
    'no-unused-vars': 'warn',
    'use-isnan': 'error',
    'for-direction': 'error',
    'require-yield': 'error',

    // suspicious
    'no-async-promise-executor': 'error',
    'no-ex-assign': 'error',
    'no-class-assign': 'error',
    'no-compare-neg-zero': 'error',
    'no-control-regex': 'error',
    'no-debugger': 'error',
    'no-duplicate-case': 'error',
    'no-dupe-class-members': 'error',
    'no-dupe-keys': 'error',
    'no-empty': 'warn',
    '@typescript-eslint/no-explicit-any': 'warn',
    'no-fallthrough': 'error',
    'no-func-assign': 'error',
    'no-global-assign': 'error',
    'no-import-assign': 'error',
    'no-misleading-character-class': 'error',
    'no-prototype-builtins': 'error',
    'no-redeclare': 'error',
    'no-shadow-restricted-names': 'error',
    '@typescript-eslint/no-unsafe-declaration-merging': 'error',
    'no-unsafe-negation': 'error',
    'require-await': 'error',
    'default-case-last': 'error',
    'react/no-array-index-key': 'warn',

    // style
    '@typescript-eslint/no-inferrable-types': 'warn',
    '@typescript-eslint/no-namespace': 'error',
    '@typescript-eslint/no-non-null-assertion': 'warn',
    'prefer-const': 'error',
    '@typescript-eslint/prefer-for-of': 'warn',
    'prefer-template': 'warn',
  },

  overrides: [
    // Server files: Node + Bun globals
    {
      files: ['packages/server/**', 'packages/web/src/server.ts'],
      env: { node: true },
      globals: {
        Bun: 'readonly',
        WebSocketPair: 'readonly',
      },
    },

    // Modals / pages: disable no-label-without-control
    {
      files: [
        'packages/web/src/components/AddSongModal.tsx',
        'packages/web/src/components/queue/QuickAddModal.tsx',
        'packages/web/src/pages/RequestsPage.tsx',
        'packages/web/src/components/settings/AdminSection.tsx',
        'packages/web/src/pages/SetupWizard.tsx',
        'packages/web/src/pages/PermissionsPage.tsx',
      ],
      rules: {
        'jsx-a11y/label-has-associated-control': 'off',
      },
    },

    // requireAuth.ts: allow namespace
    {
      files: ['packages/server/src/middleware/requireAuth.ts'],
      rules: {
        '@typescript-eslint/no-namespace': 'off',
      },
    },

    // Playlist/Songs pages: relaxed a11y + no-array-index-key
    {
      files: [
        'packages/web/src/pages/PlaylistsPage.tsx',
        'packages/web/src/pages/SongsPage.tsx',
        'packages/web/src/pages/PlaylistDetailPage.tsx',
      ],
      rules: {
        'jsx-a11y/no-static-element-interactions': 'off',
        'jsx-a11y/click-events-have-key-events': 'off',
        'react/no-array-index-key': 'off',
      },
    },

    // Song/Playlist rows and panels: relaxed a11y
    {
      files: [
        'packages/web/src/components/LibrarySongRow.tsx',
        'packages/web/src/components/SongRow.tsx',
        'packages/web/src/components/SongCard.tsx',
        'packages/web/src/components/PlaylistRow.tsx',
        'packages/web/src/components/NowPlayingBar.tsx',
        'packages/web/src/components/SongEditModal.tsx',
        'packages/web/src/components/SongEditPanel.tsx',
      ],
      rules: {
        'jsx-a11y/no-static-element-interactions': 'off',
        'jsx-a11y/click-events-have-key-events': 'off',
        'jsx-a11y/prefer-tag-over-role': 'off',
      },
    },

    // Backdrop, Layout: relaxed a11y
    {
      files: ['packages/web/src/components/Backdrop.tsx', 'packages/web/src/components/Layout.tsx'],
      rules: {
        'jsx-a11y/no-static-element-interactions': 'off',
      },
    },
  ],
});
