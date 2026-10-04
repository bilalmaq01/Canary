import "dotenv/config";
import Fastify from "fastify";
import fastifyWebsocket from "@fastify/websocket";
import fastifyStatic from "@fastify/static";
import fastifyCors from "@fastify/cors";
import fastifyCookie from "@fastify/cookie";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { existsSync } from "fs";
import { registerRoutes } from "./routes/index.js";
import { initDb, seedAdminIfNeeded } from "./db/index.js";

// Works whether run via `node server/dist/index.js` or `tsx src/index.ts`
const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, "../..");
const webDist = join(projectRoot, "web/dist");
const assetsDir = join(projectRoot, "audio");

await initDb();
await seedAdminIfNeeded();

const app = Fastify({ logger: true });

await app.register(fastifyCookie);
await app.register(fastifyCors, { origin: true, credentials: true });
app.addContentTypeParser(
  "application/x-www-form-urlencoded",
  { parseAs: "string" },
  (_req, body, done) => {
    try {
      done(null, Object.fromEntries(new URLSearchParams(body as string)));
    } catch (err) {
      done(err as Error, undefined);
    }
  }
);
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
    prefix: "/audio/",
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
    !req.url.startsWith("/audio")
  ) {
    return reply.sendFile("index.html");
  }
  reply.code(404).send({ error: "Not found" });
});

const port = Number(process.env.PORT) || 3000;
await app.listen({ port, host: "0.0.0.0" });
console.log(`Server running at http://localhost:${port}`);
