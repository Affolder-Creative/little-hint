import { defineConfig, mergeConfig } from "vite";
import base from "../../vite.config";

const origin = new URL(process.env.APP_URL!);
export default mergeConfig(
  base,
  defineConfig({
    envDir: false,
    cacheDir: "/tmp/little-hint-vite",
    plugins: [
      {
        name: "preview-watch-service-worker-cleanup",
        transformIndexHtml() {
          return [
            {
              tag: "script",
              attrs: { type: "module" },
              children: `
        if ('serviceWorker' in navigator) {
          const registration = await navigator.serviceWorker.getRegistration('/');
          if (registration && new URL(registration.active?.scriptURL || registration.waiting?.scriptURL || registration.installing?.scriptURL || location.href).pathname === '/sw.js') {
            await registration.unregister();
            const keys = await caches.keys();
            await Promise.all(keys.filter(key => key.startsWith('little-hint-static-')).map(key => caches.delete(key)));
            if (navigator.serviceWorker.controller) location.reload();
          }
        }
      `,
            },
          ];
        },
      },
    ],
    server: {
      host: "0.0.0.0",
      port: 5173,
      strictPort: true,
      allowedHosts: [origin.hostname],
      cors: { origin: origin.origin },
      origin: origin.origin,
      watch: { usePolling: true, interval: 300 },
      hmr: {
        protocol: origin.protocol === "https:" ? "wss" : "ws",
        host: origin.hostname,
        clientPort: Number(
          origin.port || (origin.protocol === "https:" ? 443 : 80),
        ),
      },
      proxy: { "/api": "http://app:3000" },
    },
  }),
);
