import "dotenv/config";
import Fastify from "fastify";
import fastifyWebsocket from "@fastify/websocket";
import fastifyStatic from "@fastify/static";
import fastifyCors from "@fastify/cors";
import { fileURLToPath } from "url";
import { join, dirname } from "path";
import { registerRoutes } from "./routes/index.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

const app = Fastify({ logger: true });

await app.register(fastifyCors, { origin: true });
await app.register(fastifyWebsocket);
await app.register(fastifyStatic, {
  root: join(__dirname, "../../web/dist"),
  prefix: "/",
});

await app.register(fastifyStatic, {
  root: join(__dirname, "../../assets"),
  prefix: "/assets/",
  decorateReply: false,
});

await registerRoutes(app);

app.get("/health", async () => ({ ok: true }));

// SPA fallback — serve index.html for any unmatched GET (React handles routing)
app.setNotFoundHandler(async (req, reply) => {
  if (req.method === "GET" && !req.url.startsWith("/api") && !req.url.startsWith("/ws") && !req.url.startsWith("/assets")) {
    return reply.sendFile("index.html");
  }
  reply.code(404).send({ error: "Not found" });
});

const port = Number(process.env.PORT) || 3000;
await app.listen({ port, host: "0.0.0.0" });
console.log(`Server running at http://localhost:${port}`);
