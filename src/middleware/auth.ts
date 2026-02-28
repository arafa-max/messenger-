import { Elysia } from "elysia";
import { jwt } from "@elysiajs/jwt";

export const authPlugin = new Elysia()
  .use(
    jwt({
      name: "jwt",
      secret: process.env.JWT_SECRET || "supersecretkey123",
    }),
  )
  .derive({ as: "scoped" }, async ({ headers, jwt, set }) => {
    const authorization = headers.authorization;

    if (!authorization) {
      set.status = 401;
      throw new Error("Unauthorized ❌");
    }

    const token = authorization.split(" ")[1];

    const payload = await jwt.verify(token);

    if (!payload) {
      set.status = 401;
      throw new Error("Invalid token ❌");
    }

    return {
      userId: payload.userId as string,
      username: payload.username as string,
    };
  });
