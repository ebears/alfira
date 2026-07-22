import { defineConfig } from 'oxlint';

export default defineConfig({
  options: {
    typeAware: true,
    typeCheck: true,
    reportUnusedDisableDirectives: 'error',
  },

  ignorePatterns: ['.pi/**', '.zed/**'],

  plugins: [
    'react',
    'react-perf',
    'jsx-a11y',
    'typescript',
    'promise',
    'import',
    'unicorn',
    'oxc',
    'eslint',
  ],

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
    // oxc — Oxc-specific correctness rules that catch subtle bugs
    // -----------------------------------------------------------------------
    // Math.min(Math.max(x, min), max) — wrong clamping direction
    'oxc/bad-min-max-func': 'error',
    // a < b < c evaluates as (a < b) < c — a boolean-number comparison
    'oxc/bad-comparison-sequence': 'error',
    // 3.14159 instead of Math.PI, 2.718 instead of Math.E, etc.
    'oxc/approx-constant': 'error',
    // new Error('msg') as a statement without throw — silently does nothing
    'oxc/missing-throw': 'error',

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
    '@typescript-eslint/no-unused-vars': 'warn',
    'use-isnan': 'error',
    'for-direction': 'error',
    'require-yield': 'error',
    '@typescript-eslint/only-throw-error': 'error',
    '@typescript-eslint/no-floating-promises': 'error',
    '@typescript-eslint/switch-exhaustiveness-check': 'error',
    'unicorn/throw-new-error': 'error',
    'unicorn/error-message': 'error',
    // Reassigning parameters is confusing — mutate properties instead
    'no-param-reassign': 'error',
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
    // type safety — catch TypeScript type-level mistakes
    // -----------------------------------------------------------------------
    // {} means "any non-nullish value", not "empty object" — use Record<string, never>
    '@typescript-eslint/no-empty-object-type': 'error',
    // Function type is unsafe — use (...args: unknown[]) => unknown
    '@typescript-eslint/no-unsafe-function-type': 'error',
    // String / Number / Boolean as types (uppercase wrappers) — use primitives
    '@typescript-eslint/no-wrapper-object-types': 'error',
    // Duplicate enum members are ambiguous and confusing
    '@typescript-eslint/no-duplicate-enum-values': 'error',
    // void in unions or intersections is a type-level mistake
    '@typescript-eslint/no-invalid-void-type': 'error',

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
    '@typescript-eslint/no-explicit-any': 'error',
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
    // Circular imports cause subtle ordering bugs — always a problem
    'import/no-cycle': 'error',
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
    // Promise created in a callback but never returned or awaited — dangling promise
    'promise/no-promise-in-callback': 'error',

    // -----------------------------------------------------------------------
    // style
    // -----------------------------------------------------------------------
    curly: 'error',
    // a ? b : c ? d : e — unreadable; use if/else or extract.
    // NOTE: oxfmt strips parens from nested ternaries, so this rule is off.
    'unicorn/no-nested-ternary': 'off',
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
    // void expressions (arr.push, el.remove) used where a value is expected
    '@typescript-eslint/no-confusing-void-expression': 'warn',

    // -----------------------------------------------------------------------
    // type-aware safety — tsgolint rules that catch runtime bugs
    // -----------------------------------------------------------------------
    // `x as Type` assertion that contradicts known types — silent type lie
    '@typescript-eslint/no-unsafe-type-assertion': 'warn',
    // String coercion of an object without .toString() — produces "[object Object]"
    '@typescript-eslint/no-base-to-string': 'warn',
    // `for (const k in arr)` — iterates string indices, a classic footgun
    '@typescript-eslint/no-for-in-array': 'warn',
    // `delete arr[0]` — leaves a sparse-hole, TypeScript doesn't catch it
    '@typescript-eslint/no-array-delete': 'warn',
    // `${maybeNull}` when it could be null/undefined — produces "null" string
    '@typescript-eslint/restrict-template-expressions': 'warn',
    // `a + b` where both sides are not strings or numbers — type-unsafe coercion
    '@typescript-eslint/restrict-plus-operands': 'warn',
    // `await` on a value whose type has no `.then()` — wasted microtask
    '@typescript-eslint/await-thenable': 'warn',
    // `return await` vs `return` — matters for stack traces and try/catch
    '@typescript-eslint/return-await': 'warn',
    // Passing `obj.method` as a callback — loses `this` binding
    '@typescript-eslint/unbound-method': 'warn',
    // Using a deprecated type or function from your own codebase
    '@typescript-eslint/no-deprecated': 'warn',
    // Spreading a non-iterable, or into a non-object — type-level nonsense
    '@typescript-eslint/no-misused-spread': 'warn',
    // Mixing string and numeric enum members breaks reverse mapping
    '@typescript-eslint/no-mixed-enums': 'warn',
    // `` `${'string literal'}` `` — pointless template expression
    '@typescript-eslint/no-unnecessary-template-expression': 'warn',
    // `Number(x)` when x is already `number` — pure noise
    '@typescript-eslint/no-unnecessary-type-conversion': 'warn',
    // Duplicate constituents in a union (`string | string`)
    '@typescript-eslint/no-duplicate-type-constituents': 'warn',
    // Redundant constituents (`string & unknown` simplifies to `string`)
    '@typescript-eslint/no-redundant-type-constituents': 'warn',
    // `x === true` or `x === false` when `x` is already `boolean`
    '@typescript-eslint/no-unnecessary-boolean-literal-compare': 'warn',
    // Comparing enums from different types — always `false`
    '@typescript-eslint/no-unsafe-enum-comparison': 'warn',
    // Default `= undefined` when the type says the param is always passed
    '@typescript-eslint/no-useless-default-assignment': 'warn',
    // `x!` non-null assertion where the type already excludes null
    '@typescript-eslint/non-nullable-type-assertion-style': 'warn',
    // `void` operator used meaninglessly (`void console.log(x)`)
    '@typescript-eslint/no-meaningless-void-operator': 'warn',
    // Unnecessary namespace qualifier on a type that's already in scope
    '@typescript-eslint/no-unnecessary-qualifier': 'warn',
    // Type parameters that can be inferred — dead weight
    '@typescript-eslint/no-unnecessary-type-parameters': 'warn',
    // `Promise.reject(nonError)` — loses stack trace info
    '@typescript-eslint/prefer-promise-reject-errors': 'warn',
    // `arr.filter(fn)[0]` → `arr.find(fn)` — O(n) vs early-exit
    '@typescript-eslint/prefer-find': 'warn',
    // `arr.sort()` without a compare function — lexicographic sort of numbers
    '@typescript-eslint/require-array-sort-compare': 'warn',
    // Getters and setters should come in pairs when one exists
    '@typescript-eslint/related-getter-setter-pairs': 'warn',
    // Prefer nullish coalescing over `||` for null/undefined checks
    '@typescript-eslint/prefer-nullish-coalescing': 'warn',
    // `unknown` in catch callback variables rather than `any`
    '@typescript-eslint/use-unknown-in-catch-callback-variable': 'warn',
    // `String#match` over `RegExp#exec` when no global flag
    '@typescript-eslint/prefer-regexp-exec': 'warn',
    // `x.startsWith('a')` over `x[0] === 'a'` — clearer intent
    '@typescript-eslint/prefer-string-starts-ends-with': 'warn',
    // Return type of `.reduce()` should match the type parameter
    '@typescript-eslint/prefer-reduce-type-parameter': 'warn',
    // Returning `this` from a method should use `this` as the return type
    '@typescript-eslint/prefer-return-this-type': 'warn',
    // Explicit dot notation for property access when the key is a static name
    '@typescript-eslint/dot-notation': 'warn',
    // Consistent return — all code paths should return a value (or none)
    '@typescript-eslint/consistent-return': 'warn',
    // `export type { Foo }` over re-exporting types as values
    '@typescript-eslint/consistent-type-exports': 'warn',

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
    // Set.size / Map.size over .length — correctness
    'unicorn/prefer-set-size': 'warn',

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
    // str.slice() over str.substr() / str.substring() — consistent, modern
    'unicorn/prefer-string-slice': 'warn',
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
    // Number.isNaN() over isNaN(), Number.isFinite() over isFinite(), etc.
    'unicorn/prefer-number-properties': 'warn',
    // structuredClone(x) over JSON.parse(JSON.stringify(x))
    'unicorn/prefer-structured-clone': 'warn',
    // String.raw over escaping backslashes in regex / path strings
    'unicorn/prefer-string-raw': 'warn',
    // Enforce kebab-case, PascalCase, or camelCase filenames
    'unicorn/filename-case': [
      'warn',
      { cases: { kebabCase: true, pascalCase: true, camelCase: true } },
    ],
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

    // Web: no-unsafe-type-assertion deferred to a follow-up PR
    {
      files: ['packages/web/**'],
      rules: {
        '@typescript-eslint/no-unsafe-type-assertion': 'off',
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

    // API wrappers + generic utilities: T used only in return type is necessary
    // for caller-side type inference. no-unnecessary-type-parameters fires on
    // single-use type params even when they're essential (e.g. get<T>(url): Promise<T>).
    {
      files: [
        'packages/server/src/shared/api.ts',
        'packages/server/src/shared/shuffle.ts',
        'packages/server/src/lib/jwt.ts',
        'packages/web/src/api/client.ts',
        'packages/web/src/hooks/useSocket.ts',
      ],
      rules: {
        '@typescript-eslint/no-unnecessary-type-parameters': 'off',
      },
    },

    // nodelink.ts: intentional || undefined to normalize empty strings to undefined
    {
      files: ['packages/server/src/utils/nodelink.ts'],
      rules: {
        'prefer-nullish-coalescing': 'off',
      },
    },

    // displayName.ts: intentional || for empty-string fallthrough chain
    {
      files: ['packages/server/src/lib/displayName.ts'],
      rules: {
        'prefer-nullish-coalescing': 'off',
      },
    },

    // useSocket.ts: as WebSocket is clearer intent than !
    {
      files: ['packages/web/src/hooks/useSocket.ts'],
      rules: {
        'non-nullable-type-assertion-style': 'off',
      },
    },

    // React useEffect callbacks legitimately return cleanup functions.
    // consistent-return can't distinguish React's void | Destructor contract.
    {
      files: ['packages/web/**'],
      rules: {
        '@typescript-eslint/consistent-return': 'off',
      },
    },

    // Bun WebSocket upgrade: return; after server.upgrade() exits the fetch handler
    // without producing a Response — correct Bun pattern, not a missing return.
    {
      files: ['packages/server/src/index.ts'],
      rules: {
        '@typescript-eslint/consistent-return': 'off',
      },
    },
  ],
});
