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
      server.middlewares.use("/api", (req, res, next) => {
        res.setHeader("Content-Type", "application/json");
        if (req.url?.startsWith("/config")) {
          res.end(JSON.stringify({ backend: backend || null }));
        } else if (!backend) {
          // Same answer as the Vercel function, instead of falling through to index.html.
          res.statusCode = 500;
          res.end(JSON.stringify({ detail: "API_BASE_URL is not set: copy .env.example to .env" }));
        } else {
          next(); // handled by the proxy below
        }
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
