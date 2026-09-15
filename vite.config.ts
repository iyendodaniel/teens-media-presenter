import { defineConfig } from "@lovable.dev/vite-tanstack-config";

// When building for the Electron shell, we need a real Node HTTP server
// (electron/main.cjs spawns it and waits for it to listen on PORT) instead
// of the Cloudflare Workers module format Lovable builds by default.
const isElectronBuild = process.env.ELECTRON_TARGET === "1";

export default defineConfig({
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
  ...(isElectronBuild ? { nitro: { preset: "node-server" } } : {}),
});
