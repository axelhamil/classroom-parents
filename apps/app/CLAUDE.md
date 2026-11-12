# App rules

Vite 8 + React 19 + TanStack Router/Query + Tailwind 4 + shadcn (`@packages/ui`) + `sonner`; i18n with `i18next` + `react-i18next` (typed catalogs in `@packages/i18n`, French only); Hono RPC client; BetterAuth client. Auto-loaded under `apps/app/`. Cross-cutting rules: `/CLAUDE.md`. Package rules it builds on: `packages/ui`, `packages/i18n`, `packages/web-kit` (each has its own `CLAUDE.md`). Server counterpart: `apps/api/CLAUDE.md`.

## Layout

```
apps/app/
  routes.ts                     Virtual route tree: rootRoute/layout/route/index, paths relative to routesDirectory "./src"
  Caddyfile                     Serves the build and injects the CSP nonce
  a11y/                         Accessibility gate (Playwright + axe), see a11y/README.md
  src/
    main.tsx                    createRoot + <AppProviders />
    router.tsx                  createRouter({ routeTree, context: { queryClient }, ...ROUTER_DEFAULTS from web-kit }). routeTree.gen.ts is generated but versioned
    router/                     One file per layout/gate (`__root`, `_guest`, `_protected`, `_shell`)
    shared/                     Cross-cutting (no business): api client, auth, i18n, observability, legal (see "Shared")
    features/<feature>/         Sub-domain: a vertical slice (see "Features")
```

Routing is file-based through `@tanstack/router-plugin/vite`'s `virtualRouteConfig` (`vite.config.ts`), not directory-mounted: `routes.ts` declares the tree once, so the vertical-slice layout (`features/<x>/<x>.route.tsx`) stays intact instead of being flattened into a `src/routes/` directory, and pathless layouts can wrap routes drawn from several features, which a directory cannot express.

`routeTree.gen.ts` is committed so a fresh clone type-checks without a build; regenerate it (`pnpm --filter app build` or the dev server) whenever `routes.ts` changes. **Keep `routes.ts`, `src/router/*.tsx` and `src/features/**/*.route.tsx` in `knip.jsonc`'s `apps/app.entry`** even though the tree is versioned: knip cannot resolve the string paths passed to `virtualRouteConfig`.

## Import direction

`routes.ts` → `features/` → `shared/`. No cross-feature imports between route-owning features. No barrels.

- `routes.ts` → `router/*.tsx`, `features/<x>/<x>.route.tsx`
- `router/*.tsx` → `shared/`, `@packages/*` (features import FROM here)
- `features/<x>/` (route-owning) → `router/*.tsx`, `shared/`, `@packages/*`, `features/<library-feature>/`
- `features/<library-feature>/` → `shared/`, `@packages/*`. Never imports from other features.
- `shared/<sub>/` → `shared/<sibling>/`, `shared/env.ts` (no upward imports)

**Placement decisor, two questions.** Before writing a component under `features/<x>/`, ask: (1) *is it mounted by the shell or any `shared/` code?* (2) *will a second route-owning feature render it?* Either yes → it belongs in `shared/<domain>/`. **Why**: both answers make the feature location structurally impossible, since `shared/` may never import `features/` and two route-owning features may never import each other. Group it as `shared/<domain>/` (like `auth/`, `legal/`) once it spans more than a component or two. *Cross-cutting* is not *reusable*: reusable and presentational → `@packages/ui`; cross-cutting and app-aware → `shared/`.

## Naming

Files `kebab-case.tsx`; components `PascalCase` named exports; hooks `use-<verb>-<noun>.ts` → `useVerbNoun`; schemas `<feature>.schema.ts` → `<noun>Schema` + `<Noun>Input` (`z.infer`); props in an `interface`.

## Features

`features/<feature>/` mirrors an API module slice. **No `domain/` on the front**: UI domain isn't pure (React deps), don't fake it. Sub-folders: `api/`, `components/`, `forms/`, `hooks/`, `__tests__/`. Routes (`<name>.route.tsx`), feature-private schemas (`<feature>.schema.ts`) and label maps (`<noun>-labels.ts`) sit flat at the root. No underscore-private folders inside features (a Next.js App Router convention, it does not transfer). No sub-domains nested under area folders (`features/<area>/<feature>/`): area = layout route, feature = top-level.

1. Routes flat at the root, one `<name>.route.tsx` per page. A feature with no route (`rgpd`) is a **library feature**: it exposes components, hooks and forms to the route-owning features that mount them. A route-owning feature MAY import a library feature (the single allowed cross-feature import); the reverse never. **Why**: composition flows downward, no cyclic feature graph.
2. Components flat, grouped only when ≥ 5 files share a concern.
3. Hooks never call `fetch` directly, they go through `shared/api/api-client.ts`.
4. Schemas are Zod with `z.infer`, co-located in `features/<x>/<x>.schema.ts`; a schema a second feature needs moves to `shared/<domain>/<noun>.schema.ts`.
5. **Forms live in `forms/<action>-form.tsx`**, isolated from their host (Card/Sheet/Dialog = layout only; the form owns RHF state, `zodResolver`, validation, submit). Pages compose, forms are reusable across hosts.
6. Cross-feature reuse is not pre-solved: extract to `packages/ui` if presentational, or promote one feature to own it.
7. **Area = layout route, not folder.** A multi-page shell is a pathless layout node in `routes.ts` (`_shell`) pointing at a `router/*.tsx` component with its navigation and `<Outlet />`; children nest under it as further entries.

## Routing: one file per route

`<name>.route.tsx` declares the route (`export const Route = createFileRoute("/full/path/id")({ ... })`, the id is a string literal that must match the id in `routes.ts`) and defines the page component inline. **The component stays internal, never exported** (`function <Name>Page() { ... }`): `autoCodeSplitting` only splits a component local to its route file, so exporting it silently pulls the page back into the main bundle. Read route state through `Route.useSearch()`, `Route.useParams()`, `Route.useRouteContext()`, never `getRouteApi`. Default preload `"intent"`.

**A new route also needs its entry in `routes.ts`**: a `<name>.route.tsx` with no entry never renders, and knip cannot see the missing wiring because those references are string paths. A new page also gets one entry in `a11y/pages.ts` (see "Accessibility gate").

## Forms and schemas

- `react-hook-form` + `zodResolver` + shadcn `Form`. Always pass `defaultValues` (no flash of uncontrolled). Submit via `form.handleSubmit((values) => mutation.mutate(values))`, never a manual `(e) => ...`.
- **Split loose vs strict for the same field.** A field *captured* in one flow (sign-in: transmit, the server validates) and *created* in another (sign-up/reset: enforce strength) needs two schemas; strength-validating sign-in locks out users with old passwords who need to log in *to change them*. Stronger guarantees → `zxcvbn-ts`, not required special characters.
- **Schemas carry no inline `message:`**; see "i18n".

## API client (Hono RPC)

One client in `shared/api/api-client.ts`: `createApiClient(baseUrl, hcWithType)` from `@packages/web-kit/api/api-client`, which sets `credentials: "include"`, normalizes the trailing slash (`hc` drops the last segment otherwise) and wraps fetch to inject `X-Request-Id`, the slot for future global handlers (401 redirect, token refresh, Capacitor Bearer). Import `hcWithType` from `api/client`, not an inline `hc<AppType>` (`tsc` resolves `ApiClient` once).

- `AbortSignal` goes in the per-call second argument: `await $get({}, { init: { signal } })`.
- Types: `InferRequestType<typeof $endpoint>["json"]` + `InferResponseType<typeof $endpoint, 200>`.
- **Errors stay `throw on !res.ok`**: `ApplyGlobalResponse` widens response types but gives no discriminated union.
- **CSRF is transparent**: the API validates `Origin` (no double-submit token, no `X-CSRF-Token`); the browser sends `Origin` itself. Do not add CSRF header injection.
- **CSP nonce**: Vite's `html.cspNonce` (`vite.config.ts`) emits a `<meta property="csp-nonce">` and nonce attributes carrying a Caddy placeholder; Caddy's `templates` resolves it per request and sends the matching CSP header (`Caddyfile`). `index.html` holds no meta; the same mechanism stamps the blocking `/theme-init.js`, the only classic script, which is why it runs under `'strict-dynamic'`. Never inline the nonce in JS.

## Queries and mutations

Options factories compose better than hook wrappers: typed, prefetchable in `beforeLoad`, overridable per call site. A wrapper earns its keep only when the same side effects fire at *every* call site; otherwise (or when unsure) it is a factory. A hook doing only `return useMutation({ mutationFn })` is indirection: promote it to a factory.

| Case | Where | Form |
|---|---|---|
| Query, feature-scoped | `features/<x>/api/<x>.queries.ts` | `xxxQueryOptions` via `queryOptions(...)`; `useQuery`, and `ensureQueryData` in `beforeLoad` |
| Query, cross-feature | `shared/api/queries/<noun>.ts` | Same shape. Promote on the 2nd consumer. |
| Mutation, feature-scoped | `features/<x>/api/<x>.mutations.ts` (one file, several factories) | `<verbNoun>MutationOptions` via `mutationOptions(...)`; the call site owns side effects |
| Mutation, cross-feature or multi-step | `shared/api/mutations/<verb-noun>.ts` | Same shape |
| Mutation whose side effects always fire | `features/<x>/hooks/use-<verb>.ts` | Hook wrapping `useMutation`, owns `onSuccess`/`onError` |
| Pure React utility | `features/<x>/hooks/` or `shared/` | Plain hook |

`mutationOptions` rules (factories are objects: never prefix `use-`):

1. Side effects belong to the call site: no `toast`, `navigate` or `invalidateQueries` in the factory. `void navigate(...)` in a callback, never `await`.
2. Spread, don't override: `useMutation({ ...createXMutationOptions, onSuccess: ... })`.
3. `mutationKey` is the resource path plus the verb on every factory (`["account", "deletion", "request"]`), so the mutation is identifiable in devtools and by `useIsMutating`.
4. Types via `InferRequestType`/`InferResponseType<..., 200>` + `if (!res.ok) throwApiError(res, "<errors.fallback key>")`.
5. Multi-step workflows live in the factory; a single `mutationFn` returns server-verified output.
6. Single-call factories thread `init.signal`; a multi-step factory with cleanup usually can't honour cancellation, say so in the code if so.

**A cache key names every input the response varies with, the ambient ones included.** If two requests can return two different answers they get two different keys; an input not visible at the call site (the signed-in user, a selected child) still goes in the key. **Absence is `null`, never `undefined`** (`undefined` is dropped from a serialized key). **The `enabled` guard lives in the factory, not the call site**: a call site that spreads the options and adds its own `enabled` overwrites it. Invalidate through `<factory>(...).queryKey` so a key that gains a segment never leaves a stale prefix behind.

## UI composition

Primitives, tokens and their authoring rules live in `packages/ui/CLAUDE.md`. As a consumer:

1. **`className` is for layout only**: `flex` (default), `w-*`, `h-*`, `mx-auto`, `gap-*`, responsive breakpoints; `grid` only for true 2D, `flex flex-col gap-*` for any vertical stack. Colors, typography, radius, shadows and look-defining paddings live in the theme or the primitive. Inline `bg-foo text-bar p-3` is theme drift.
2. **shadcn first, shadcn-pure.** Check `@packages/ui/components/ui/*` and the shadcn registry before writing custom. Use the real slots (`Card` + `CardHeader` + `CardTitle` + `CardContent`, optional `CardDescription`/`CardFooter`/`CardAction`); a wrong slot forces hacks (`pt-6`, `space-y-4`). Custom (last resort) lives in `@packages/ui`, never inline in a feature.
3. **A raw `<a className="text-...">`, `<span className="...rounded-full bg-...">` or `<div className="...rounded-lg border bg-...">` in a feature is a skipped slot or a duplicated primitive.** Promote, don't patch. Reach for:
   - **Links and nav**: `NavLink` (`plain`/`pill`/`underline`, `active`, compose via `asChild`), `TextLink` for inline links.
   - **Surfaces**: `Panel` (`asChild`, `tone`, `size`) for boxed content; `Card` is the page-level container only.
   - **Markers and text**: `Badge variant="secondary"` for numbered/iconic markers, lucide icons for list bullets, `TypographyInline` for inline muted/mono text, `CodeBlock` for `<pre>`, `CodeTextarea` for pasted machine text.
   - **Data**: `DescriptionList` (`stacked`/`inline`) for label-value pairs, `ListRow`/`ListRowButton` for rows, `CopyableValue` for copy rows (toast and labels stay in the app), `InitialsAvatar` for entity initials.
   - **Explaining in place**: `IconButton` for any icon-only control (required `label`, rendered as name and tooltip), `TruncatedText` for a clipped value (wraps on phones, tab stop only while clipped), `Hint` for a disabled control's reason, a badge or a term (tooltip, plus visible text on coarse pointers). The one `TooltipProvider` is in `app-providers`.
   - **Forms and dialogs**: `FormTextField`/`FormCheckboxField`, `DestructiveActionDialog` for destructive confirms, `BottomBanner` for a pinned bottom bar.
4. **Enum to copy**: a `<noun>-labels.ts` map keyed by the enum and resolved through `t()` (feature root, or `shared/<domain>/` once shared), never an inline ternary in JSX.
5. **Typography**: text goes through the shadcn typography exports (named, not namespace). The page title is `<TypographyH1 variant="page">`; a settings tab whose card already carries the visible title renders `<TypographyH1 className="sr-only">` so the page keeps exactly one `<h1>`. Never a raw `<h1 className="text-2xl ...">`.
6. **Page width**: `pageContainerVariants({ width })`; call sites add only `flex`/`gap-*`/`py-*`, never a hand-picked `max-w-*` or `px-*`.
7. **Theme and dark mode**: `public/theme-init.js` (a symlink to `@packages/web-kit/src/theme/theme-init.js`, because `public/` is served verbatim) sets `.dark` before first paint, `@packages/web-kit/theme/use-theme` owns the choice afterwards; both read the same storage key, stored choice first, system otherwise. **Why a blocking script file and no React-rendered script**: a script tag in the tree needs the nonce threaded through JS, a same-origin file only needs the one Vite already stamps. The toggle uses the View Transitions API with a `prefers-reduced-motion` fallback; the view-transition CSS is in `globals.css`.

## Accessibility gate

**Exactly one `<main>` and one `<h1>` per rendered page.** `__root.tsx` and the pathless gates never wrap in landmarks: they are passthroughs (`component: Outlet`) or, when every child shares one page width, a plain container around the `Outlet`. Each `<feature>.route.tsx` owns its `<header>`/`<main>`/`<footer>`. This is a CI gate (`.github/workflows/ci.yml`): a new page needs one entry in `a11y/pages.ts` (axe in light and dark, exactly one `<main>` and one `<h1>`); a new interactive primitive puts its keyboard contract in the interaction spec (`a11y/interaction.spec.ts`).

## i18n

- **No user-visible text is a literal at its call site.** Every string that reaches the DOM, a `toast()`, an `aria-label` or an email subject comes from a catalog key through `t()`. **Why**: a literal is invisible to both the type-checker and the parity gate, so it can never be translated and its absence can never be detected. **Test before merging**: search the diff for a quoted string in JSX text, in a `label`/`placeholder`/`title`/`aria-label` attribute or in a `toast` argument; if it isn't one of the exceptions below, it is wrong.
- **The two permanent exceptions**: (1) the French legal prose (the policy bodies in `features/legal/policies/fr.tsx`, the prose in the `accessibility`, `cookies`, `data-rights` and `sub-processors` routes and the cookie inventory), legally per-locale content written once per language, never split into catalog keys; (2) the sub-processor register (`shared/sub-processors.config.ts`), English because it restates the signed DPA, though its user-facing `purpose` and `region` go through `common.legal.subProcessors.*` behind `shared/sub-processor-labels.ts`. The contact address on those pages is `VITE_CONTACT_EMAIL` (validated in `shared/env.ts`), never a literal.
- **Translation is read through the React tree; `getErrorsT()` is the exception, not the shortcut.** Components and hooks call `useTranslation`. `getErrorsT()` exists only for code with no tree to read from: the global `QueryCache`/`MutationCache` handlers and `toast.ts`. One named exception: the last-resort copy of a failed request, `errors.fallback.*`: `throwApiError(res, "<key>")` takes the key and resolves it at throw time; a `toastError` fallback that is not the caller's own `t()` string goes through `errorFallback("<key>")` inside the failure callback. Both are evaluated at event time, never during render, and the key is typed against the catalog. **Why**: `getErrorsT()` resolves against whatever the instance holds *at call time* and returns the raw key before boot. **Test**: if the call site is evaluated during render, it must be `useTranslation`.
- **Schemas carry no inline `message:`.** Validation copy comes from the global Zod map (`@packages/web-kit/i18n/zod-error-map`); a per-issue `message:` wins over the global map (Zod's own precedence), so an inline literal can never be translated. Custom checks pass `{ params: { i18nKey } }`.
- Catalog authoring (typed keys): `packages/i18n/CLAUDE.md`. A new backend error code needs its copy in the `errors` catalog: refusals render as localized copy, never raw backend text (`byCode`, then `bySuffix`, then the caller's fallback).

## Shared (`src/shared/`)

- `api/`: the app's `api` and `queryClient` instances (built by the `@packages/web-kit` factories), `queries/`, `mutations/` (`api-error`, `messages`, `toast` are in `@packages/web-kit/api/errors/`).
- `auth/`: auth-client, `auth-broadcast`, `safe-redirect`, `use-refresh-session`, `use-sign-out`, `use-cancel-deletion`, `*.schema.ts`.
- `components/`: cross-feature UI (legal-footer, deletion-pending-banner, theme-toggle, not-found-page, ...).
- `layout/`: the shell (`app-shell`: one `AppNavigation` that is a bottom bar on phones and tabs in the app bar from `md`, fed by the single list in `nav-items`; `user-menu`; `screen` for a titled page). `pwa/`: service worker registration, `useInstallState`, push support (`push-support.ts`: permission, browser subscription, the parent who last posted it) and `usePushEndpointSync`, mounted by the shell, which re-posts the browser subscription when its endpoint changed for the same parent. **A browser subscription belongs to the parent who posted it**: shown as on, or re-posted, only for that parent, released (server then browser) before sign-out. **Why**: a shared phone would otherwise show a second parent alerts that the server still sends to the first, minors' data included. `stream/`: `useAppUserStream`, the user SSE stream that invalidates the `events` and `children` queries.
- `legal/`, `legal-routes.ts`, `sub-processors.config.ts`, `sub-processor-labels.ts`: the legal surface shared by the shell and the legal pages. `LEGAL_ROUTES` is the one list read by `legal-footer.tsx`: never duplicate it.
- `i18n/`: app-side translation hooks. The i18next boot, global Zod error map, `getErrorsT` and `errorFallback` are in `@packages/web-kit/i18n/`.
- `observability/`: see below. `app-providers.tsx` (provider tree), `env.ts` (validated env). The typed cross-tab channel under `auth-broadcast` is `@packages/web-kit/broadcast-channel`.

## Observability

- **Every error shown to the user also reaches telemetry, and for TanStack Query it already does.** Global `QueryCache`/`MutationCache` `onError` handlers (`@packages/web-kit/observability/query-error-handler`, bound by `createQueryClient(captureError)` in `api/query-client.ts`) capture 5xx and network errors (no `status`); expected errors (4xx incl. 401/403/404/429, `CancelledError`, `AbortError`) are filtered by `@packages/web-kit/observability/error-classifier`. **Never add `captureError` to a query/mutation `onError`**: it double-reports; local `onError` is UX only (toast, redirect). Manual `captureError(err, context)` is for paths outside TanStack Query (event listeners, fire-and-forget promises).
- **Mutations capture by default; flow-control signals are an explicit allowlist** (`FLOW_CONTROL_MESSAGES` in the error classifier). The global `MutationCache.onError` fires *before* a hook's local `onError` can swallow a flow-control throw, so those exact messages are skipped by name; hooks throw the constants exported next to the list (`EMAIL_NOT_VERIFIED_REDIRECT`), never a literal of their own. **Why an allowlist and not "skip bare `Error`s"**: auth hooks wrap *every* failure, server 5xx included, in a plain `Error(message)` without `status`, so filtering on shape would silence all auth telemetry; a missed allowlist entry costs visible noise, the inverse costs invisible blind spots. A new flow-control throw exports its constant and joins the allowlist in the same PR.
- **`Sentry.setUser` is synced automatically** by `watchSession(queryClient)` (`observability/session-watcher.ts`, started module-level in `app-providers.tsx`), observing the `["session"]` query, so every auth flow is covered without touching hooks. Never call `setUser` from components or hooks. RGPD: id only. The `["session"]` key is hardcoded there on purpose (importing `sessionQueryOptions` would pull `auth-client` and `window` into non-React code and break node tests), and `state.data === undefined` is skipped because `undefined` = not resolved yet while `null` = resolved with no session, and only the latter must clear the user.
- **No direct `@sentry/react` import outside `observability/sentry.ts`.** Removability = swap the `./sentry` imports for `./noop` (see `docs/OBSERVABILITY.md`); call sites never change.

## Auth and route gates

- `shared/auth/auth-client.ts`: one `createAuthClient` with the same plugin set as the server (none today); sessions through TanStack Query, not the auth lib's nanostore.
- **Gates are layout routes with an `id` and no path** (`_guest`, `_protected`, `_shell`), in `router/*.tsx` wired by `routes.ts`. Each owns its `beforeLoad`; children inherit via `addChildren`; the `_` prefix marks "no path contribution". Name them by access *condition*, not feature (avoid `_auth`).
- **Single source of session truth: TanStack Query, not React state.** Router context exposes only `queryClient`; gates read `ensureQueryData(sessionQueryOptions)` (stale time aligned with `cookieCache.maxAge`). No `useSession()` bridge, no race.
- **After an auth mutation, push the state into the query, then navigate.** Sign-in, verify, deletion schedule: `await refreshSession()` from `useRefreshSession()` (refetches here, then broadcasts to other tabs). Sign-out: `setQueryData(..., null)`. Then `void navigate({ to })`.
- **Token-consuming routes stay outside the gates** (attach to `rootRoute`, like `/verify-email`): under `_guest` they would be redirected away the moment the token signs the user in. Token effects use `useRef(false)` against StrictMode double-fire.
- **Cross-tab sync via `BroadcastChannel`** (`auth-broadcast.ts`): any auth state change calls `broadcastAuthChange()`; `app-providers.tsx` listens once and refetches the session. No payload, the cookie is shared, each tab refetches live state.
- **Ownership is the signed-in user.** There is no organization scope: the server filters every row on `user_id`, the front never sends an owner id.

## Commands

`pnpm --filter app test` (vitest) · `pnpm --filter app type-check` (app + `a11y/` project) · `pnpm turbo run check:a11y --filter=app` (Playwright + axe over the preview build, needs a running API, see `a11y/README.md`).
