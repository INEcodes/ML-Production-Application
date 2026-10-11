import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv, type Plugin } from "vite";

// In production the browser calls /api/*, which Vercel routes to api/[endpoint].js.
// `npm run dev` mimics that function so no Vercel CLI is needed: /api/{health,version,
// predict} are proxied to API_BASE_URL (from frontend/.env) and /api/config is answered here.
export default defineConfig(({ mode }) => {
  const backend = (loadEnv(mode, process.cwd(), "").API_BASE_URL || "").replace(/\/+$/, "");

  const devConfigEndpoint: Plugin = {
    name: "dev-api-config",
    configureServer(server) {
      server.middlewares.use("/api/config", (_req, res) => {
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ backend: backend || null }));
      });
    },
  };

  return {
    plugins: [react(), tailwindcss(), devConfigEndpoint],
    server: backend
      ? {
          proxy: {
            "^/api/(health|version|predict)$": {
              target: backend,
              changeOrigin: true,
              // the target's own path (e.g. /cnn) is prepended by the proxy
              rewrite: (path) => path.replace(/^\/api/, ""),
            },
          },
        }
      : undefined,
  };
});
