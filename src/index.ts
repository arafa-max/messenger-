import { Elysia } from "elysia";
import { authRoutes } from "./routes/auth";
import { userRoutes } from "./routes/users";
import { chatRouters } from "./routes/chats";
import { wsRouters } from "./routes/ws";
import { uploadRoutes } from "./routes/upload";
import { cors } from "@elysiajs/cors";
import swagger from "@elysiajs/swagger";

const app = new Elysia()
  .use(cors())
  .use(
    swagger({
      documentation: {
        info: {
          title: "Mesenger API",
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

console.log("Hello via Bun!");
