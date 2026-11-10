import { resolve } from "node:path";
import { sentryVitePlugin } from "@sentry/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";
import { parseAppEnv } from "./src/shared/env.schema";

const sentryAuthToken = process.env.SENTRY_AUTH_TOKEN;
const sentryOrg = process.env.SENTRY_ORG;
const sentryProject = process.env.SENTRY_PROJECT;
const release = process.env.VITE_GIT_SHA;

export default defineConfig(({ command, mode }) => {
  if (command === "build") parseAppEnv(loadEnv(mode, __dirname, "VITE_"));

  return {
    plugins: [
      tanstackRouter({
        target: "react",
        routesDirectory: "./src",
        generatedRouteTree: "./src/routeTree.gen.ts",
        virtualRouteConfig: "./routes.ts",
        autoCodeSplitting: true,
      }),
      react(),
      tailwindcss(),
      sentryAuthToken && sentryOrg && sentryProject
        ? sentryVitePlugin({
            authToken: sentryAuthToken,
            org: sentryOrg,
            project: sentryProject,
            release: release ? { name: release } : undefined,
            sourcemaps: { filesToDeleteAfterUpload: ["dist/**/*.map"] },
          })
        : undefined,
    ].filter(Boolean),
    resolve: {
      alias: { "@": resolve(__dirname, "./src") },
      dedupe: ["react", "react-dom"],
    },
    optimizeDeps: {
      include: ["react", "react-dom", "react-dom/client", "react/jsx-runtime"],
    },
    server: {
      port: 5173,
      headers: {
        // HMR injects scripts/styles inline, so enforcing is impractical in dev; report-only surfaces violations in the console
        "Content-Security-Policy-Report-Only":
          "default-src 'self' 'unsafe-inline' 'unsafe-eval' data: blob:; connect-src 'self' ws: wss: http://localhost:3000",
      },
    },
    build: { chunkSizeWarningLimit: 700, sourcemap: "hidden" },
    html: { cspNonce: "{{placeholder `http.request.uuid`}}" },
  };
});
