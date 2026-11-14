# Site rules

Astro 7 static build of the public landing, served on the root domain; the app lives on `app.<domain>`. Auto-loaded under `apps/site/`. Cross-cutting rules: `/CLAUDE.md`. Package rules it builds on: `packages/ui`, `packages/i18n`, `packages/web-kit`.

## Layout

```
apps/site/
  astro.config.ts          Static output, React islands, sitemap, CSP meta, Tailwind through Vite
  src/env.schema.ts        PUBLIC_SITE_URL, PUBLIC_APP_URL: bare origins, validated at build
  src/pages/               index.astro (landing), 404.astro, robots.txt.ts
  src/layouts/             The one HTML shell: head, SEO, header, legal footer
  src/components/          React components rendered at build, two of them hydrated as islands
  public/                  Symlinks to the shared assets in packages/ui and to web-kit's theme-init.js
  a11y/                    Playwright + axe gate on the built site (preview on port 4182)
  vercel.json              Vercel project config: build, clean URLs, security and cache headers
  preview.config.ts        Preview server that serves dist with the vercel.json headers
```

## Rules

1. **Every word ships in the served HTML.** Components render at build; only what needs the browser is an island (`client:visible` for the product sample, `client:only` for the theme toggle, whose store has no server snapshot). **Why**: crawlers and answer engines read the HTML, a client-mounted text does not exist for them.
2. **Copy comes from the `site` namespace of `@packages/i18n`**, read at build and passed as props. An island never imports the catalog as a value. **Why**: the catalog would land in the client bundle for a few strings.
3. **The theme is `@packages/ui/globals.css` imported, never copied**, and styling stays tokens plus layout classes, as in the app. **Why**: the landing and the app must not drift apart.
4. **The site imports packages only**, never `modules/` nor another app (`site-imports-only-packages` in `.dependency-cruiser.cjs`). **Why**: it deploys alone, without the api.
5. **Every URL is built from the validated env**: canonical, OG, JSON-LD and sitemap from `PUBLIC_SITE_URL`; the sign in call to action and the legal links from `PUBLIC_APP_URL`, where the legal pages live. **Why**: one wrong origin would point search engines and parents at localhost.
6. **Structured data mirrors visible content.** The FAQPage JSON-LD is generated from the same `FAQ_QUESTIONS` list the page renders. **Why**: markup without matching visible text is a contradictory signal.
7. **Inline scripts and styles need a CSP hash**: Astro writes them into the CSP `<meta>` at build, so never add an inline `style=` attribute or a script outside Astro's pipeline.

## Checks

`type-check` = `astro check`; `test` = vitest on the date and env rules; `check:a11y` = one `<main>`, one `<h1>`, `lang="fr"` and no serious or critical WCAG 2.1 AA violation on `/` and the 404, light and dark, plus the keyboard path to the call to action. New page → add it to `a11y/a11y.spec.ts`.

Biome lints the frontmatter of `.astro` files only; it cannot see template usage, so `noUnusedImports` and `noUnusedVariables` are off for them in `biome.json` and `astro check` covers that ground.

`astro dev` starts in the background when run by an agent (`astro dev stop` to end it). `pnpm preview` is a Vite preview of `dist` that applies `vercel.json`, not `astro preview`, which ignores Vite plugins: what the gate audits carries the production headers.
