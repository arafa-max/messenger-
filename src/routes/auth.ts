import { Elysia, t } from "elysia";
import { db } from "../db";
import { users, refreshTokens, tokenBlacklist } from "../db/schema";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { jwt } from "@elysiajs/jwt";

const jwtAccess = jwt({
  name: "jwtAccess",
  secret: process.env.JWT_SECRET || "supersecretkey123",
  exp: "15m",
});

const jwtRefresh = jwt({
  name: "jwtRefresh",
  secret: process.env.JWT_REFRESH_SECRET || "refreshsecretkey456",
  exp: "7d",
});

export const authRoutes = new Elysia({ prefix: "/auth" })
  .use(jwtAccess)
  .use(jwtRefresh)
  .post(
    "/register",
    async ({ body, set, jwtAccess, jwtRefresh }: any) => {
      try {
        const { username, email, password } = body;

        const existing = await db
          .select()
          .from(users)
          .where(eq(users.email, email));
        if (existing.length > 0) {
          set.status = 400;
          return { error: "user already exists" };
        }

        const existingUsername = await db
          .select()
          .from(users)
          .where(eq(users.username, username));

        if (existingUsername.length > 0) {
          set.status = 400;
          return { error: "Username already taken" };
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

        const accessToken = await jwtAccess.sign({
          userId: user.id,
          username: user.username,
        });
        const refreshToken = await jwtRefresh.sign({ userId: user.id });

        await db.insert(refreshTokens).values({
          userId: user.id,
          token: refreshToken,
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        });
        return { message: "user created ✅", accessToken, refreshToken };
      } catch (err) {
        console.error("REGISTER ERROR:", err);
        set.status = 500;
        return { error: "Internal server error" };
      }
    },
    {
      body: t.Object({
        username: t.String({ minLength: 3, maxLength: 30 }),
        email: t.String({
          pattern: "^[a-zA-Z0-9._%+\\-]+@[a-zA-Z0-9.\\-]+\\.[a-zA-Z]{2,}$",
        }),
        password: t.String({
          minLength: 8,
          pattern: "^(?=.*[A-Za-z])(?=.*\\d).+$",
        }),
      }),
    },
  )
  .post(
    "/login",
    async ({ body, set, jwtAccess, jwtRefresh }: any) => {
      const { email, password } = body;

      const [user] = await db
        .select()
        .from(users)
        .where(eq(users.email, email));

      if (!user) {
        set.status = 401;
        return { error: "Invalid credentials ❌" };
      }
      const isValid = await bcrypt.compare(password, user.password);
      if (!isValid) {
        set.status = 401;
        return { error: "Invalid credentials ❌" };
      }
      const accessToken = await jwtAccess.sign({
        userId: user.id,
        username: user.username,
      });

      const refreshToken = await jwtRefresh.sign({
        userId: user.id,
      });

      await db.delete(refreshTokens).where(eq(refreshTokens.userId, user.id));
      await db.insert(refreshTokens).values({
        userId: user.id,
        token: refreshToken,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      });
      return { message: "succesfull login ✅", accessToken, refreshToken };
    },
    {
      body: t.Object({
        email: t.String(),
        password: t.String(),
      }),
    },
  )

  .post(
    "/refresh",
    async ({ body, set, jwtAccess, jwtRefresh }: any) => {
      const { refreshToken } = body;

      if (!refreshToken || refreshToken.trim() === "") {
        set.status = 400;
        return { error: "Refresh token is required" };
      }

      const payload = await jwtRefresh.verify(refreshToken);
      if (!payload) {
        set.status = 401;
        return { error: "Invalid refresh token ❌" };
      }

      const [stored] = await db
        .select()
        .from(refreshTokens)
        .where(eq(refreshTokens.token, refreshToken));

      if (!stored || stored.expiresAt < new Date()) {
        set.status = 401;
        return { error: "Refresh token expired or not found ❌" };
      }
      const [user] = await db
        .select()
        .from(users)
        .where(eq(users.id, payload.userId as string));

      if (!user) {
        set.status = 401;
        return { error: "User not found ❌" };
      }
      const newAccessToken = await jwtAccess.sign({
        userId: user.id,
        username: user.username,
      });

      return { accessToken: newAccessToken };
    },
    {
      body: t.Object({
        refreshToken: t.String(),
      }),
    },
  )

  .post(
    "/logout",
    async ({ body, set, headers }: any) => {
      try {
        const { refreshToken } = body;

        if (!refreshToken || refreshToken.trim() === "") {
          set.status = 400;
          return { error: "Refresh token is required" };
        }

        const authorization = headers.authorization;
        if (authorization) {
          const accessToken = authorization.split(" ")[1];
          await db.insert(tokenBlacklist).values({
            token: accessToken,
            expiresAt: new Date(Date.now() + 15 * 60 * 1000),
          });
        }
        await db
          .delete(refreshTokens)
          .where(eq(refreshTokens.token, refreshToken));

        return { message: "Logged out ✅" };
      } catch (err) {
        console.error("LOGOUT ERROR:", err);
        set.status = 500;
        return { error: "Internal server error" };
      }
    },
    {
      body: t.Object({
        refreshToken: t.String(),
      }),
    },
  );
