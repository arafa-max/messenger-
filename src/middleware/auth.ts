import { Elysia } from "elysia";
import { jwt } from "@elysiajs/jwt";
import { tokenBlacklist } from "../db/schema";
import { db } from "../db";
import { eq } from "drizzle-orm";

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

    if (!token) {
      set.status = 401;
      throw new Error("Invalid token ❌");
    }
    const payload = await jwt.verify(token);

    if (!payload) {
      set.status = 401;
      throw new Error("Invalid token ❌");
    }
    const blacklisted = await db
      .select()
      .from(tokenBlacklist)
      .where(eq(tokenBlacklist.token, token));

    if (blacklisted.length > 0) {
      set.status = 401;
      throw new Error("Token has been revorked");
    }

    return {
      userId: payload.userId as string,
      username: payload.username as string,
    };
  });
