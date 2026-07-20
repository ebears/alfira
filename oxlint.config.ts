import { defineConfig } from 'oxlint';

export default defineConfig({
  options: {
    typeAware: true,
    typeCheck: true,
    reportUnusedDisableDirectives: 'error',
  },

  ignorePatterns: ['.pi/**', '.zed/**'],

  plugins: ['react', 'jsx-a11y', 'typescript', 'promise', 'import'],

  rules: {
    // -----------------------------------------------------------------------
    // a11y
    // -----------------------------------------------------------------------
    'react/button-has-type': 'error',
    'jsx-a11y/no-static-element-interactions': 'warn',
    'jsx-a11y/click-events-have-key-events': 'warn',

    // -----------------------------------------------------------------------
    // complexity
    // -----------------------------------------------------------------------
    'no-extra-boolean-cast': 'error',
    'no-useless-catch': 'error',
    '@typescript-eslint/no-this-alias': 'error',
    '@typescript-eslint/no-unnecessary-type-constraint': 'error',

    // -----------------------------------------------------------------------
    // correctness
    // -----------------------------------------------------------------------
    'no-const-assign': 'error',
    'no-constant-binary-expression': 'error',
    'no-constant-condition': 'warn',
    'no-empty-character-class': 'error',
    'no-empty-pattern': 'error',
    'no-obj-calls': 'error',
    'constructor-super': 'error',
    'no-self-assign': 'error',
    'no-setter-return': 'error',
    'no-unreachable': 'error',
    'no-unsafe-finally': 'error',
    'no-unsafe-optional-chaining': 'error',
    'no-unused-labels': 'error',
    'no-unused-vars': 'warn',
    'use-isnan': 'error',
    'for-direction': 'error',
    'require-yield': 'error',
    '@typescript-eslint/only-throw-error': 'error',
    '@typescript-eslint/no-floating-promises': 'error',
    '@typescript-eslint/switch-exhaustiveness-check': 'error',
    'unicorn/throw-new-error': 'error',
    'unicorn/error-message': 'error',
    // Reassigning parameters is confusing — mutate properties instead
    'no-param-reassign': 'warn',
    // Comma operator outside for-loops is almost always a mistake
    'no-sequences': 'error',
    // Assignment in return (e.g. return x = 5) is never intentional
    'no-return-assign': 'error',
    // Functions inside loops capture mutable variables — a classic footgun
    'no-loop-func': 'error',
    // a = b = c leaks globals in sloppy mode; confusing in strict
    'no-multi-assign': 'warn',
    // delete obj[computed] breaks type safety — use Map or undefined
    '@typescript-eslint/no-dynamic-delete': 'error',
    // require() has no place in an ESM codebase
    '@typescript-eslint/no-require-imports': 'error',
    // e.g. -someString is almost always a bug
    '@typescript-eslint/no-unsafe-unary-minus': 'error',

    // -----------------------------------------------------------------------
    // security
    // -----------------------------------------------------------------------
    'no-eval': 'error',
    'no-implied-eval': 'error',
    'no-new-func': 'error',
    'no-new-wrappers': 'error',
    'no-extend-native': 'error',
    'no-iterator': 'error',
    'unicorn/no-new-buffer': 'error',
    'react/jsx-no-script-url': 'error',
    'react/no-danger': 'error',
    'react/jsx-no-target-blank': 'error',

    // -----------------------------------------------------------------------
    // suspicious
    // -----------------------------------------------------------------------
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
    // Duplicate props in JSX — second silently wins
    'react/jsx-no-duplicate-props': 'error',
    // Comments rendered as text nodes are always a mistake
    'react/jsx-no-comment-textnodes': 'error',
    // this.state.x = 5 is a pre-hooks anti-pattern
    'react/no-direct-mutation-state': 'error',
    // isMounted() anti-pattern — use cleanup functions
    'react/no-is-mounted': 'error',
    // Legacy string refs — use createRef or useRef
    'react/no-string-refs': 'error',
    // Typos in JSX attributes (class → className, for → htmlFor, etc.)
    'react/no-unknown-property': 'error',
    // new Promise.resolve() / new Promise.reject() — nonsensical
    'promise/no-new-statics': 'error',
    // A module importing itself is always a mistake
    'import/no-self-import': 'error',
    // Merge duplicate imports from the same module
    'import/no-duplicates': 'warn',

    // -----------------------------------------------------------------------
    // equality — 'smart' allows == null / != null (idiomatic nullish checks)
    // -----------------------------------------------------------------------
    eqeqeq: ['error', 'smart'],
    // typeof x === 'undefined' → x === undefined
    'unicorn/no-typeof-undefined': 'warn',

    // -----------------------------------------------------------------------
    // imports
    // -----------------------------------------------------------------------
    'import/first': 'warn',
    'import/no-cycle': 'warn',
    'unicorn/prefer-node-protocol': 'warn',
    // export let can cause cross-module side-channel bugs
    'import/no-mutable-exports': 'warn',
    // Enforce consistent type-only import style — codebase uses inline
    'import/consistent-type-specifier-style': ['warn', 'prefer-inline'],

    // -----------------------------------------------------------------------
    // promises
    // -----------------------------------------------------------------------
    'promise/prefer-await-to-then': 'error',
    'promise/valid-params': 'error',
    'promise/catch-or-return': 'error',
    '@typescript-eslint/no-misused-promises': [
      'error',
      { checksVoidReturn: { attributes: false, properties: false } },
    ],
    // Every .then() should return or throw
    'promise/always-return': 'warn',
    // Enforce resolve/reject naming in new Promise() callbacks
    'promise/param-names': 'warn',

    // -----------------------------------------------------------------------
    // style
    // -----------------------------------------------------------------------
    curly: 'error',
    'no-useless-concat': 'warn',
    'object-shorthand': 'warn',
    '@typescript-eslint/array-type': 'warn',
    '@typescript-eslint/consistent-type-imports': 'warn',
    '@typescript-eslint/no-inferrable-types': 'warn',
    '@typescript-eslint/no-namespace': 'error',
    '@typescript-eslint/no-non-null-assertion': 'warn',
    '@typescript-eslint/prefer-for-of': 'warn',
    '@typescript-eslint/prefer-optional-chain': 'warn',
    '@typescript-eslint/prefer-ts-expect-error': 'warn',
    'prefer-const': 'error',
    'prefer-template': 'warn',
    'unicorn/catch-error-name': 'warn',
    // { ['foo']: 1 } → { foo: 1 }
    'no-useless-computed-key': 'warn',
    // Empty constructor() { super() } is implicit
    'no-useless-constructor': 'warn',
    // { import { foo as foo } } is noise
    'no-useless-rename': 'warn',
    // Standalone { } blocks are almost never needed in ES modules
    'no-lone-blocks': 'warn',
    // foo.call(undefined, x) → foo(x)
    'no-useless-call': 'warn',
    // Object.hasOwn(obj, key) over hasOwnProperty.call(obj, key)
    'prefer-object-has-own': 'warn',
    // Prefer function type to interface with call signature
    '@typescript-eslint/prefer-function-type': 'warn',
    // Remove type arguments that can be inferred
    '@typescript-eslint/no-unnecessary-type-arguments': 'warn',
    // Remove redundant type assertions
    '@typescript-eslint/no-unnecessary-type-assertion': 'warn',
    // export { } without purpose
    '@typescript-eslint/no-useless-empty-export': 'warn',
    // <></> around a single child is unnecessary
    'react/jsx-no-useless-fragment': 'warn',

    // Components defined inside other components lose state on every render
    'react/no-unstable-nested-components': 'warn',

    // -----------------------------------------------------------------------
    // modern JS/TS — prefer modern, idiomatic APIs
    // -----------------------------------------------------------------------
    // catch { } over catch (_e) { }
    'unicorn/prefer-optional-catch-binding': 'warn',
    // Collapse if { ... } else { if { } } into else if
    'unicorn/no-lonely-if': 'warn',
    // arr.includes(x) over arr.indexOf(x) !== -1
    'unicorn/prefer-includes': 'warn',
    // [...arr] over Array.from(arr) for iterables
    'unicorn/prefer-spread': 'warn',
    // for-of over Array#forEach — faster, supports break, better type-narrowing
    'unicorn/no-array-for-each': 'warn',
    // 1.0 → 1, 1.50 → 1.5
    'unicorn/no-zero-fractions': 'warn',
    // Drop unnecessary undefined in return / ?? undefined
    'unicorn/no-useless-undefined': 'warn',
    // .flatMap(fn) over .map(fn).flat()
    'unicorn/prefer-array-flat-map': 'warn',
    // Date.now() over new Date().getTime()
    'unicorn/prefer-date-now': 'warn',
    // arr.at(-1) over arr[arr.length - 1]
    'unicorn/prefer-negative-index': 'warn',
    // throw new TypeError(...) for type errors
    'unicorn/prefer-type-error': 'warn',
    // Use [] literal over new Array()
    'unicorn/no-new-array': 'error',
    // DOM: el.dataset.foo over el.getAttribute('data-foo')
    'unicorn/prefer-dom-node-dataset': 'warn',
    // DOM: event.key over event.keyCode
    'unicorn/prefer-keyboard-event-key': 'warn',
    // DOM: el.replaceWith() over parent.replaceChild()
    'unicorn/prefer-modern-dom-apis': 'warn',
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

    // Server-only: DOM unicorn rules don't apply
    {
      files: ['packages/server/**'],
      rules: {
        'unicorn/prefer-dom-node-dataset': 'off',
        'unicorn/prefer-keyboard-event-key': 'off',
        'unicorn/prefer-modern-dom-apis': 'off',
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

    // Virtual list components: array index as key is safe for static skeleton/loading placeholders
    {
      files: [
        'packages/web/src/components/VirtualList.tsx',
        'packages/web/src/components/VirtualSongList.tsx',
        'packages/web/src/components/VirtualSongGrid.tsx',
        'packages/web/src/components/VirtualRequestList.tsx',
      ],
      rules: {
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
