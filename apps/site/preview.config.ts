import { staticHostingPreview } from "@packages/web-kit/hosting/static-hosting";
import { defineConfig } from "vite";
import hosting from "./vercel.json";

export default defineConfig({
  appType: "mpa",
  plugins: [staticHostingPreview(hosting)],
  preview: { port: 4182 },
});
