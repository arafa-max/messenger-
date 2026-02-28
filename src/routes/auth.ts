import { Elysia, t } from "elysia";
import { db } from "../db";
import { users } from "../db/schema";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";

export const authRoutes = new Elysia({ prefix: "/auth" })
  .post(
    "/register",
    async ({ body, set }) => {
      const { username, email, password } = body;

      const existing = await db
        .select()
        .from(users)
        .where(eq(users.email, email));
      if (existing.length > 0) {
        set.status = 400;
        return { error: "user already exists" };
      }
      const hashedPassword = await bcrypt.hash(password, 10);

      const [user] = await db
        .insert(users)
        .values({
          username,
          email,
          password: hashedPassword,
        })
        .returning();

      if (!user) {
        set.status = 500;
        return { error: "Error create user ❌" };
      }
      return { message: "user created ✅", userId: user.id };
    },
    {
      body: t.Object({
        username: t.String(),
        email: t.String(),
        password: t.String(),
      }),
    },
  )
  .post(
    "/login",
    async ({ body, set, jwt }: any) => {
      const { email, password } = body;

      const [user] = await db
        .select()
        .from(users)
        .where(eq(users.email, email));
      if (!user) {
        set.status = 500;
        return { error: "Error create user ❌" };
      }
      const isValid = await bcrypt.compare(password, user.password);
      if (!isValid) {
        set.status = 400;
        return { error: "wrong password ❌" };
      }
      const token = await jwt.sign({
        userId: user.id,
        username: user.username,
      });
      return { message: "succesfull login ✅", token };
    },
    {
      body: t.Object({
        email: t.String(),
        password: t.String(),
      }),
    },
  );
