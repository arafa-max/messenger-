import { Elysia, t } from "elysia";
import { db } from "../db";
import { chats, chatMembers, messages } from "../db/schema";
import { eq, and, ne ,desc} from "drizzle-orm";
import { authPlugin } from "../middleware/auth";

export const chatRouters = new Elysia({ prefix: "/chats" })
  .use(authPlugin)

  .post(
    "/create",
    async (ctx: any) => {
      const { userId, body, set } = ctx;
      const { targetUserId } = body;

      const existingChats = await db
        .select({ chatId: chatMembers.chatId })
        .from(chatMembers)
        .where(eq(chatMembers.userId, userId));

      for (const { chatId } of existingChats) {
        if(!chatId) continue;

        const members = await db
          .select()
          .from(chatMembers)
          .where(eq(chatMembers.chatId, chatId));

        const isPersonal = members.length === 2;
        const hasTarget = members.some((m) => m.userId === targetUserId);

        const [chat] = await db
          .select()
          .from(chats)
          .where(and(eq(chats.id, chatId!), eq(chats.isGroup, false)));

        if (isPersonal && hasTarget && chat) {
          return { message: "Chat already exist ✅", chatId };
        }
      }
      const [chat] = await db.insert(chats).values({}).returning();

      if (!chat) {
        set.status = 500;
        return { error: "Error creating chat ❌" };
      }

      await db.insert(chatMembers).values([
        { chatId: chat.id, userId },
        { chatId: chat.id, userId: targetUserId },
      ]);
      return { message: "Chat created ✅", chatId: chat.id };
    },
    {
      body: t.Object({
        targetUserId: t.String(),
      }),
    },
  )

  .post(
    "/group",
    async (ctx: any) => {
      const { userId, body, set } = ctx;
      const { name, memberIds } = body;

      const [chat] = await db
        .insert(chats)
        .values({
          name,
          isGroup: true,
          createdBy: userId,
        })
        .returning();
      if (!chat) {
        set.status = 500;
        return { error: "Error creating group ❌" };
      }
      const members = [userId, ...memberIds].map((id) => ({
        chatId: chat.id,
        userId: id,
      }));

      await db.insert(chatMembers).values(members);

      return { message: "Group created ✅", chatId: chat.id };
    },
    {
      body: t.Object({
        name: t.String(),
        memberIds: t.Array(t.String()),
      }),
    },
  )

  .post(
    "/:chatId/members/add",
    async (ctx: any) => {
      const { userId, body, params, set } = ctx;

      const member = await db
        .select()
        .from(chatMembers)
        .where(
          and(
            eq(chatMembers.chatId, params.chatId),
            eq(chatMembers.userId, userId),
          ),
        );
      if (member.length === 0) {
        set.status = 403;
        return { error: "Access denied ❌" };
      }

      await db.insert(chatMembers).values({
        chatId: params.chatId,
        userId: body.userId,
      });
      return { message: "Member added ✅" };
    },
    {
      body: t.Object({
        userId: t.String(),
      }),
    },
  )

  .delete("/:chatId/members/:memberId", async (ctx: any) => {
    const { userId, params, set } = ctx;

    const chat = await db
      .select()
      .from(chats)
      .where(and(eq(chats.id, params.chatId), eq(chats.createdBy, userId)));
    if (chat.length === 0) {
      set.status = 403;
      return { error: "Only creator can members ❌" };
    }
    await db
      .delete(chatMembers)
      .where(
        and(
          eq(chatMembers.chatId, params.chatId),
          eq(chatMembers.userId, params.memberId),
        ),
      );
    return { message: "Member removed" };
  })

  .get("/", async (ctx: any) => {
    const { userId } = ctx;

    const userChats = await db
      .select({ chatId: chatMembers.chatId })
      .from(chatMembers)
      .where(eq(chatMembers.userId, userId));
    return userChats;
  })

  .get("/:chatId/message", async (ctx: any) => {
    const { userId, params, set } = ctx;

    const member = await db
      .select()
      .from(chatMembers)
      .where(
        and(
          eq(chatMembers.chatId, params.chatId),
          eq(chatMembers.userId, userId),
        ),
      );
    if (member.length === 0) {
      set.status = 403;
      return { error: "Access denied ❌" };
    }
    const chatMessages = await db
      .select()
      .from(messages)
      .where(eq(messages.chatId, params.chatId));

    return chatMessages;
  })

  .post("/:chatId/read", async (ctx: any) => {
    const { userId, params } = ctx;

    await db
      .update(messages)
      .set({ isRead: true })
      .where(
        and(eq(messages.chatId, params.chatId), ne(messages.senderId, userId)),
      );
    return { message: "Messages marked as read ✅" };
  });
