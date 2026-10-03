import "dotenv/config";
import Fastify from "fastify";
import fastifyWebsocket from "@fastify/websocket";
import fastifyStatic from "@fastify/static";
import fastifyCors from "@fastify/cors";
import { join } from "path";
import { existsSync } from "fs";
import { registerRoutes } from "./routes/index.js";

const root = process.cwd();
const webDist = join(root, "web/dist");
const assetsDir = join(root, "assets");

const app = Fastify({ logger: true });

await app.register(fastifyCors, { origin: true });
await app.register(fastifyWebsocket);

const webDistExists = existsSync(webDist);

if (webDistExists) {
  await app.register(fastifyStatic, {
    root: webDist,
    prefix: "/",
  });
} else {
  app.log.warn(`web/dist not found at ${webDist}`);
}

if (existsSync(assetsDir)) {
  await app.register(fastifyStatic, {
    root: assetsDir,
    prefix: "/assets/",
    decorateReply: false,
  });
}

await registerRoutes(app);

app.get("/health", async () => ({ ok: true }));

// SPA fallback — serve index.html for /c/:token and other client-side routes
app.setNotFoundHandler(async (req, reply) => {
  if (
    webDistExists &&
    req.method === "GET" &&
    !req.url.startsWith("/api") &&
    !req.url.startsWith("/ws") &&
    !req.url.startsWith("/twilio") &&
    !req.url.startsWith("/assets")
  ) {
    return reply.sendFile("index.html");
  }
  reply.code(404).send({ error: "Not found" });
});

const port = Number(process.env.PORT) || 3000;
await app.listen({ port, host: "0.0.0.0" });
console.log(`Server running at http://localhost:${port}`);
