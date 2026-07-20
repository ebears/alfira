import { defineConfig } from 'oxlint';

export default defineConfig({
  options: {
    typeAware: true,
    typeCheck: true,
    reportUnusedDisableDirectives: 'error',
  },

  ignorePatterns: ['.pi/**', '.zed/**'],

  plugins: ['react', 'react-perf', 'jsx-a11y', 'typescript', 'promise', 'import'],

  rules: {
    // -----------------------------------------------------------------------
    // react hooks — correctness rules that prevent subtle bugs
    // -----------------------------------------------------------------------
    'react/rules-of-hooks': 'error',
    'react/exhaustive-deps': 'error',

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
    // Missing key on iterator elements breaks React reconciliation
    'react/jsx-key': 'error',
    // Children passed as an explicit prop break composition
    'react/no-children-prop': 'error',
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
    // react-perf — rendering performance anti-patterns
    // -----------------------------------------------------------------------
    // Inline functions/objects/JSX as props break React.memo and cause
    // unnecessary re-renders. Fix with useCallback / useMemo / extract outside.
    'react-perf/jsx-no-new-function-as-prop': 'warn',
    'react-perf/jsx-no-new-object-as-prop': 'warn',
    'react-perf/jsx-no-jsx-as-prop': 'warn',
    // Context value objects constructed inline cause full subtree re-renders
    'react/jsx-no-constructed-context-values': 'warn',
    // Default prop arrays/objects break referential equality
    'react/no-object-type-as-default-prop': 'warn',

    // -----------------------------------------------------------------------
    // typescript strictness — close the `any` escape hatch
    // -----------------------------------------------------------------------
    '@typescript-eslint/no-unsafe-assignment': 'warn',
    '@typescript-eslint/no-unsafe-argument': 'warn',
    '@typescript-eslint/no-unsafe-member-access': 'warn',
    '@typescript-eslint/no-unsafe-call': 'warn',
    '@typescript-eslint/no-unsafe-return': 'warn',
    // Conditions that are always truthy/falsy — dead code detector
    '@typescript-eslint/no-unnecessary-condition': 'warn',

    // -----------------------------------------------------------------------
    // style consistency — enforce one idiomatic pattern
    // -----------------------------------------------------------------------
    // Require `interface` over `type` for object types (or vice versa)
    '@typescript-eslint/consistent-type-definitions': ['warn', 'interface'],
    // new Map<string>() vs new Map() with type annotation — pick one style
    '@typescript-eslint/consistent-generic-constructors': ['warn', 'constructor'],
    // fn(): void vs fn: () => void — pick method shorthand
    '@typescript-eslint/method-signature-style': 'warn',
    // console.log has no place next to a proper logger
    'no-console': 'warn',
    // Set.has(x) over arr.includes(x) — O(1) vs O(n), better signaling
    'unicorn/prefer-set-has': 'warn',

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

    // EQ slider bands: fixed-length array with stable order, index is the correct key
    {
      files: ['packages/web/src/components/settings/EqualizerSection.tsx'],
      rules: {
        'react/no-array-index-key': 'off',
      },
    },

    // VirtualList: dynamic virtualizer styles are generated per-item from scroll position —
    // height/transform values are inherently unique and cannot be statically extracted.
    {
      files: ['packages/web/src/components/VirtualList.tsx'],
      rules: {
        'react-perf/jsx-no-new-object-as-prop': 'off',
      },
    },

    // VirtualSongGrid: GridCard created inside useMemo([]) for masonry stable identity.
    // Inline functions/objects in the render body are intentional — cardPropsRef.current
    // provides latest values while keeping component type identity stable.
    {
      files: ['packages/web/src/components/VirtualSongGrid.tsx'],
      rules: {
        'react/no-unstable-nested-components': 'off',
        'react-perf/jsx-no-new-function-as-prop': 'off',
        'react-perf/jsx-no-new-object-as-prop': 'off',
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

    // Plain JS files: type-aware rules produce noise on untyped code
    {
      files: ['nodelink-config/**', 'packages/web/public/**'],
      rules: {
        '@typescript-eslint/no-unsafe-assignment': 'off',
        '@typescript-eslint/no-unsafe-member-access': 'off',
        '@typescript-eslint/no-unsafe-call': 'off',
        '@typescript-eslint/no-unsafe-return': 'off',
        '@typescript-eslint/no-unsafe-argument': 'off',
        '@typescript-eslint/no-unnecessary-condition': 'off',
        'no-console': 'off',
      },
    },

    // Logger: console is the implementation, not a mistake
    {
      files: ['packages/server/src/shared/logger.ts'],
      rules: {
        'no-console': 'off',
      },
    },

    // =======================================================================
    // react-perf: temporary overrides while fixing file-by-file.
    // Remove files from this list as they are cleaned up.
    // When the list is empty, delete this entire override block.
    // =======================================================================
    {
      files: [
        'packages/web/src/components/AddSongModal.tsx',
        'packages/web/src/components/BulkEditModal.tsx',
        'packages/web/src/components/NowPlayingBar.tsx',
        'packages/web/src/components/QueuePanel.tsx',
        'packages/web/src/components/SongEditPanel.tsx',
        'packages/web/src/pages/PlaylistDetailPage.tsx',
        'packages/web/src/pages/SongsPage.tsx',
        'packages/web/src/pages/SetupWizard.tsx',
      ],
      rules: {
        'react-perf/jsx-no-new-function-as-prop': 'off',
        'react-perf/jsx-no-new-object-as-prop': 'off',
        'react-perf/jsx-no-jsx-as-prop': 'off',
        'react/jsx-no-constructed-context-values': 'off',
        'react/no-object-type-as-default-prop': 'off',
      },
    },

    // Server entry: startup banner uses console intentionally
    {
      files: ['packages/web/src/server.ts'],
      rules: {
        'no-console': 'off',
      },
    },

    // Web client files: console is the debug/error logger for browser-side code
    {
      files: [
        'packages/web/src/api/client.ts',
        'packages/web/src/context/AuthContext.tsx',
        'packages/web/src/components/settings/CompressorSection.tsx',
        'packages/web/src/components/settings/EqualizerSection.tsx',
        'packages/web/src/components/NowPlayingBar.tsx',
      ],
      rules: {
        'no-console': 'off',
      },
    },

    // Route handler files: "always falsy/truthy" checks on Drizzle query results
    // are defensive guards. The type system says the value can't be null, but
    // these checks exist as runtime safety. Suppress no-unnecessary-condition
    // here and fix types incrementally.
    {
      files: [
        'packages/server/src/routes/auth.ts',
        'packages/server/src/routes/permissions.ts',
        'packages/server/src/routes/player.ts',
        'packages/server/src/routes/playlists.ts',
        'packages/server/src/routes/songs.ts',
        'packages/server/src/routes/tags.ts',
        'packages/server/src/routes/requests.ts',
        'packages/server/src/lib/migrateExistingTags.ts',
        'packages/server/src/lib/ensureTagsMigrated.ts',
        'packages/server/src/lib/playlistAccess.ts',
        'packages/server/src/lib/syncPlaylistToTag.ts',
        'packages/server/src/lib/search.ts',
        'packages/server/src/utils/nodelink.ts',
        'packages/server/src/GuildPlayer.ts',
        'packages/server/src/routes/equalizer.ts',
        'packages/server/src/index.ts',
        // Web files with known false positives for this pedantic rule:
        // optional chains on union types (User | null) and defensive checks
        'packages/web/src/components/MobileNav.tsx',
        'packages/web/src/components/QueuePanel.tsx',
        'packages/web/src/components/settings/AdminSection.tsx',
        'packages/web/src/hooks/usePaginatedData.ts',
        'packages/web/src/hooks/useScrollObserver.ts',
        'packages/web/src/components/AddSongsModal.tsx',
        'packages/web/src/components/VirtualList.tsx',
        'packages/web/src/components/VirtualSongList.tsx',
        'packages/web/src/pages/PlaylistDetailPage.tsx',
        'packages/web/src/pages/SongsPage.tsx',
      ],
      rules: {
        '@typescript-eslint/no-unnecessary-condition': 'off',
      },
    },
  ],
});
