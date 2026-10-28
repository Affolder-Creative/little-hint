import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import packageInfo from "./package.json" with { type: "json" };
export default defineConfig({
  plugins: [react()],
  define: { __APP_VERSION__: JSON.stringify(packageInfo.version) },
  server: { port: 5173, proxy: { "/api": "http://127.0.0.1:3000" } },
  build: {
    outDir: "dist/client",
    manifest: true,
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            {
              name: "react",
              test: /node_modules\/(react|react-dom|scheduler)\//,
            },
          ],
        },
      },
    },
  },
  test: { include: ["tests/**/*.test.ts"], testTimeout: 30000 },
});
