# Module rules

`modules/<name>` holds one business module, published in the workspace as `@modules/<name>`. Auto-loaded for every file under `modules/`. Cross-cutting rules: `/CLAUDE.md`. The rules that still live in `apps/api/CLAUDE.md` (module anatomy, layer purity, port placement, CQRS, DI, domain events, testing) apply here unchanged until they move.

## Anatomy

```
modules/<name>/
  package.json        exports per layer pointing at src/ and schemas/, no build
  tsconfig.json       noEmit
  bunfig.toml         only when a test needs a preload
  schemas/            the tables this module owns
  scripts/            check-*.ts against a real database, about this module only
  src/
    <name>.module.ts  defineModule<<Name>Prerequisites>()
    domain/  application/{ports,services,use-cases,dto,event-handlers}  infrastructure/{repositories,adapters,http}
    testing/          fixtures other tests may import
    __TESTS__/        every test, layering.test.ts included
```

`scripts/new-module.sh <name>` creates the manifest, tsconfig, an empty `defineModule` and the layering test; `pnpm install` links it. `<name>/CLAUDE.md` exists only for rules no other guide or skill holds (invariants, events emitted, ports exposed, traps).

## Contract

1. **The module exports factories, the host composes them.** `<name>.module.ts` (`defineModule`), `create<Name>Routes(deps)`, `create<Name>InternalRoutes(deps)`, plus what the host must bind (application services, event handlers). Only an app imports `*.module.ts`. **Why**: a second importer would inherit the module's prerequisites and could wire it twice.
2. **Everything from outside arrives in `<Name>Prerequisites`**: `ddd-kit` ports, the ports the module declares, its typed settings. Never `env`, never the built container, never the auth instance. **Why**: a package that reads ambient state cannot be type-checked or tested alone, and swapping a provider would touch its code.
3. **A need towards another module is a port the consumer declares**, served by an application service of the provider and bound by the host. Never an import of the other module. **Why**: the dependency stays visible in one host file and either side can be removed without touching the other. The port speaks in simple types (ids, primitives, plain objects the consumer defines) and returns `Result<T, AppError>`; each module narrows `AppError` to its own typed codes. **Why**: two modules never share a class, and one error shape lets the host bind any provider without a translating adapter per error type.
4. **Events go through the one catalog in `packages/events`**, emitted in the same unit of work as the write; a module declares its types in its own contribution file (`packages/events/src/contrib/`). A handler reacting to another module's event lives in the reacting module and subscribes by event type, never by importing the emitter.
5. **A read joining tables of two modules lives in the host** (`apps/api/src/queries/`) behind a port the module declares. **Why**: a module reading another module's tables couples their schemas without any visible dependency.
6. **Routes receive their guards** (`RouteGuards`) and their services through `deps`. A route may read its own tables; it writes only through a service or a use case.
7. **Relative imports inside the module, no `@/` alias, no barrel.** Other modules and apps reach it only through the `exports` of its `package.json`.
8. **Source only**: `exports` point at `src/` and `schemas/`, no build script, no `dist/` (root rule 4).

## Boundaries

`pnpm check:boundaries` scans `apps packages modules` with `.dependency-cruiser.cjs`: no cross-module import, except that a schema may import another module's schema through `@modules/<other>/schemas/*` for a foreign key (the cascade lives in the database), and tests, `scripts/` and `eval/` may reach another module's `schemas/` to seed rows, never anything else; only apps import `*.module.ts`, `packages/` never reaches a module or an app, a module never imports an app, the fronts never import a module, `domain/` and `application/` stay free of infrastructure, schemas, database and frameworks, host queries read modules through `schemas/` and `application/ports/` only, no runtime cycle. Each module adds `src/__TESTS__/layering.test.ts` on `@packages/test/source-scan` for what imports cannot express (no throw in domain or application, no env read, no write from `infrastructure/http`, no transaction parameter).

## Moving a module here

A move keeps the HTTP contract unchanged: same `METHOD path` set (the surface parity test in `apps/api/src/shared/surface/` fails on drift) and the same `AppType` the app type-checks against. A contract change is its own commit, never part of a move.
