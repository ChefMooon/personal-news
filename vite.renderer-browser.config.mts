import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import {
  installRendererBrowserApi,
  loadRendererBrowserFixtures,
} from "./scripts/renderer-browser-shared.mjs";

export default defineConfig({
  root: "src/renderer",
  resolve: {
    alias: {
      "@shared": new URL("./src/shared", import.meta.url).pathname,
      "@renderer": new URL("./src/renderer/src", import.meta.url).pathname,
    },
  },
  server: { host: "127.0.0.1", port: 4175, strictPort: true },
  plugins: [
    react(),
    tailwindcss(),
    {
      name: "renderer-browser-api-shim",
      transformIndexHtml: {
        order: "pre",
        handler(html) {
          return html.replace(
            '<script type="module" src="/src/main.tsx"></script>',
            '<script src="/__renderer-browser/init.js"></script>\n    <script type="module" src="/src/main.tsx"></script>',
          );
        },
      },
      configureServer(server) {
        server.middlewares.use(async (request, response, next) => {
          if (request.url?.split("?")[0] !== "/__renderer-browser/init.js") {
            next();
            return;
          }
          try {
            const fixtures = await loadRendererBrowserFixtures(server);
            const script = `(${installRendererBrowserApi.toString()})(${JSON.stringify(fixtures)});`;
            response.statusCode = 200;
            response.setHeader(
              "Content-Type",
              "text/javascript; charset=utf-8",
            );
            response.setHeader("Cache-Control", "no-store");
            response.end(script);
          } catch (error) {
            response.statusCode = 500;
            response.setHeader("Content-Type", "text/plain; charset=utf-8");
            response.end(error instanceof Error ? error.stack : String(error));
          }
        });
      },
    },
  ],
});
