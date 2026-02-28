import { Elysia } from "elysia";
import { db } from "../db";
import { users } from "../db/schema";
import { eq } from "drizzle-orm";
import { authPlugin } from "../middleware/auth";

export const userRoutes = new Elysia({ prefix: "/users" })

  .use(authPlugin)
  .get("/me", async (ctx) => {
    const { userId, set } = ctx as any;
    console.log("userId:", userId);

    const [user] = await db
      .select({
        id: users.id,
        username: users.username,
        email: users.email,
        createdAt: users.createdAt,
        isOnline: users.isOnline,
      })
      .from(users)
      .where(eq(users.id, userId));

    if (!user) {
      set.status = 404;
      return { error: "User not found ❌" };
    }
    return user;
  })

  .get("/search/:username", async ({ params, set }) => {
    const [user] = await db
      .select({
        id: users.id,
        username: users.username,
        isOnline: users.isOnline,
      })
      .from(users)
      .where(eq(users.username, params.username));
    if (!user) {
      set.status = 404;
      return { error: "User not found ❌" };
    }
    return user;
  });
