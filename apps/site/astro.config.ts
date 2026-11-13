import react from "@astrojs/react";
import sitemap from "@astrojs/sitemap";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "astro/config";
import { loadEnv } from "vite";
import { parseSiteEnv } from "./src/env.schema";

const env = parseSiteEnv(loadEnv(process.env.NODE_ENV ?? "production", process.cwd(), "PUBLIC_"));

export default defineConfig({
  site: env.PUBLIC_SITE_URL,
  output: "static",
  trailingSlash: "ignore",
  integrations: [react(), sitemap()],
  security: { csp: true },
  markdown: { syntaxHighlight: false },
  server: { port: 4181 },
  vite: {
    plugins: [tailwindcss()],
  },
});
