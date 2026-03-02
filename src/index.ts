import { authRoutes } from "./routes/auth";
import { userRoutes } from "./routes/users";
import { chatRouters } from "./routes/chats";
import { wsRouters } from "./routes/ws";
import { uploadRoutes } from "./routes/upload";
import { cors } from "@elysiajs/cors";
import swagger from "@elysiajs/swagger";
import { Elysia } from "elysia";
import { lt } from "drizzle-orm";
import { refreshTokens, tokenBlacklist } from "./db/schema";
import { db } from "./db";
import { rateLimit } from "elysia-rate-limit";

const app = new Elysia()
  .use(cors())
  .use(
    rateLimit({
      duration: 6000,
      max: 60,
      errorResponse: new Response(
        JSON.stringify({ error: "Too many requests ❌" }),
        {
          status: 429,
          headers: { "Content-Type": "application/json" },
        },
      ),
    }),
  )
  .use(
    swagger({
      documentation: {
        info: {
          title: "Messenger API",
          version: "1.0.0",
        },
        components: {
          securitySchemes: {
            bearerAuth: {
              type: "http",
              scheme: "bearer",
              bearerFormat: "JWT",
            },
          },
        },
        security: [{ bearerAuth: [] }],
      },
    }),
  )
  .use(authRoutes)
  .use(userRoutes)
  .use(chatRouters)
  .use(wsRouters)
  .use(uploadRoutes)
  .get("/", () => "Messenger API works! ✅")
  .listen(3000);
setInterval(
  async () => {
    await db
      .delete(refreshTokens)
      .where(lt(refreshTokens.expiresAt, new Date()));
    await db
      .delete(tokenBlacklist)
      .where(lt(tokenBlacklist.expiresAt, new Date()));
    console.log("Cleaned up expired tokens ✅");
  },
  24 * 60 * 60 * 1000,
);
console.log("Hello via Bun!");
