import { Elysia } from "elysia";
import { db } from "../db";
import { messages, chatMembers, users } from "../db/schema";
import { eq, and } from "drizzle-orm";
import { jwt } from "@elysiajs/jwt";

const connections = new Map<string, any>();

const userCache = new Map<string, string>();

export const wsRouters = new Elysia()
  .use(
    jwt({
      name: "jwt",
      secret: process.env.JWT_SECRET || "supersecretkey123",
    }),
  )
  .ws("/ws/:chatId", {
    async open(ws) {
      const chatId = ws.data.params.chatId;

      const token = (ws.data.query as any).token;

      const jwtInstance = (ws.data as any).jwt;

      const payload = await jwtInstance.verify(token);

      if (!payload) {
        ws.close();
        return;
      }

      const userId = payload.userId;

      await db
        .update(users)
        .set({ isOnline: true })
        .where(eq(users.id, userId));

      const member = await db
        .select()
        .from(chatMembers)
        .where(
          and(eq(chatMembers.chatId, chatId), eq(chatMembers.userId, userId)),
        );
      if (member.length === 0) {
        ws.close();
        return;
      }
      await db
        .update(users)
        .set({ isOnline: true })
        .where(eq(users.id, userId));

      const connKey = `${chatId}:${userId}`;
      connections.set(connKey, ws);
      userCache.set(ws.id, userId);

      console.log(`User ${userId} connected to chat ${chatId}`);
    },
    async message(ws, msg: any) {
      const chatId = ws.data.params.chatId;

      const userId = userCache.get(ws.id);
      if (!userId) return;

      const [saved] = await db
        .insert(messages)
        .values({
          chatId,
          senderId: userId,
          text: msg.text,
        })
        .returning();

      connections.forEach((conn, key) => {
        if (key.startsWith(chatId)) {
          conn.send(JSON.stringify(saved));
        }
      });
    },
    async close(ws) {
      const chatId = ws.data.params.chatId;

      const userId = userCache.get(ws.id);
      if (userId) {
        await db
          .update(users)
          .set({ isOnline: false })
          .where(eq(users.id, userId));
        connections.delete(`${chatId}:${userId}`);
        userCache.delete(ws.id);
        console.log(`User ${userId} disconnected`);
      }
    },
  });
