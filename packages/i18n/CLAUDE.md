# i18n rules

The translation source of truth: typed catalogs, locale helpers and an isolated i18next factory, shared by the app (UI) and the API (emails). Auto-loaded under `packages/i18n/`. The product is French only (`LOCALES = ["fr"]`). How the front consumes it (the "no literal at the call site" rule, `getErrorsT`): `apps/app/CLAUDE.md`.

## Layout

```
src/
  catalogs/<locale>/<namespace>.ts   typed object literals (`as const`), never `.json`; `index.ts` assembles the namespaces
  locales.ts                          `LOCALES`, `Locale`, `DEFAULT_LOCALE`, `isLocale`, `toLocale`
  resolve.ts                          `resolveLocale(candidates)`: cookie, then browser languages, region subtag dropped
  load-catalog.ts                     `loadCatalog(locale)`, the French catalog ships in the main bundle
  create-instance.ts                  `createI18n({ locale, resources })`
  lookup.ts, types.ts                 catalog lookup helper, i18next `CustomTypeOptions` typed on the French catalog
```

## Rules

1. **The French catalog is the source of truth.** Add the key to `catalogs/fr/<namespace>.ts` before the call site (the typed `t()` rejects a key that does not exist). A second locale, if one ever comes, brings back a parity test in the same change.
2. **Namespaces are derived from the catalog, never listed by hand** (`NAMESPACES = Object.keys(catalog)`). **Why**: a second hand-kept list drifts, and the copy that drifts is the one nothing reads at build time.
3. **A locale value is narrowed at the boundary with `toLocale`** (DB column, session payload, JSON body), never a local `isLocale(x) ? x : DEFAULT` ternary. A new locale is a new entry in `LOCALES`, a new catalog folder and a branch in `loadCatalog`, together.
4. **One fresh i18next instance per use, never a shared singleton, on the server.** **Why**: the email worker renders for many recipients in sequence, a shared mutable `language` would leak one recipient's locale into the next message. 
5. **Dynamic parts are `{{placeholders}}`, formatted by the caller.** Dates and numbers are never pre-formatted into a value; a key is a sentence a translator can read alone.
6. **Prose that is legally per-locale content** (policy bodies) is not in these catalogs; the exceptions are listed in `apps/app/CLAUDE.md`.

## Commands

`pnpm --filter @packages/i18n test` (vitest).
