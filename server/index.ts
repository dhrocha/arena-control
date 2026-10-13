import http from "node:http";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import express from "express";
import { createServer as createViteServer } from "vite";
import { ArenaDatabase, UPLOADS_DIR } from "./db/database.ts";
import { MatchEngine } from "./domain/MatchEngine.ts";
import { createApiRouter } from "./api/index.ts";
import { setupWebSocket } from "./websocket/index.ts";
import { buildNetworkInfo } from "./network/ips.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const isProd = process.env.NODE_ENV === "production";

async function main(): Promise<void> {
  const db = new ArenaDatabase();
  const engine = new MatchEngine(db);
  const settings = db.getSettings();
  const port = Number(process.env.PORT) || settings.port || 3000;

  const app = express();
  const server = http.createServer(app);

  app.use("/api", createApiRouter(db, engine));
  app.use("/uploads", express.static(UPLOADS_DIR));
  app.use("/audio", express.static(path.join(ROOT, "public/audio")));
  app.use("/fonts", express.static(path.join(ROOT, "public/fonts")));
  app.use("/images", express.static(path.join(ROOT, "public/images")));

  setupWebSocket(server, engine);

  if (isProd) {
    const dist = path.join(ROOT, "dist");
    app.use(express.static(dist));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(dist, "index.html"));
    });
  } else {
    // HMR no mesmo HTTP server — evita porta 24678 e conflito com /ws
    const vite = await createViteServer({
      root: ROOT,
      server: {
        middlewareMode: true,
        hmr: { server },
      },
      appType: "custom",
    });
    app.use(vite.middlewares);
    app.use("*", async (req, res, next) => {
      try {
        const url = req.originalUrl;
        let template = fs.readFileSync(path.join(ROOT, "index.html"), "utf-8");
        template = await vite.transformIndexHtml(url, template);
        res.status(200).set({ "Content-Type": "text/html" }).end(template);
      } catch (e) {
        vite.ssrFixStacktrace(e as Error);
        next(e);
      }
    });
  }

  server.listen(port, "0.0.0.0", () => {
    const network = buildNetworkInfo(port);
    console.log("");
    console.log("═══════════════════════════════════════");
    console.log("  ARENA CONTROL SERVER");
    console.log("═══════════════════════════════════════");
    console.log(`  Status:  RUNNING`);
    console.log(`  Porta:   ${port}`);
    for (const iface of network.interfaces) {
      console.log(`  ${iface.name}: ${iface.address}`);
    }
    console.log(`  Admin:   ${network.urls.admin}`);
    console.log(`  Control: ${network.urls.control}`);
    console.log(`  Pelada:  ${network.urls.pelada}`);
    console.log(`  Arena:   ${network.urls.arena}`);
    console.log(`  Setup:   ${network.urls.setup}`);
    console.log("═══════════════════════════════════════");
    console.log("");
  });

  const shutdown = () => {
    console.log("\nEncerrando Arena Control...");
    server.close();
    db.close();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((err) => {
  console.error("Falha ao iniciar servidor:", err);
  process.exit(1);
});
