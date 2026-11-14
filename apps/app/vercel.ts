import type { StaticHostingConfig } from "@packages/web-kit/hosting/static-hosting";
import { appHosting } from "./src/hosting/app-hosting";

interface VercelProject extends StaticHostingConfig {
  framework: string;
  installCommand: string;
  buildCommand: string;
  outputDirectory: string;
}

export const config: VercelProject = {
  framework: "vite",
  installCommand: "pnpm install --frozen-lockfile",
  buildCommand: "pnpm build",
  outputDirectory: "dist",
  ...appHosting(process.env),
};
