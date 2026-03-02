import { Elysia, t } from "elysia";
import { db } from "../db";
import { chats, chatMembers, messages } from "../db/schema";
import { eq, and, ne, desc, inArray, lt } from "drizzle-orm";
import { authPlugin } from "../middleware/auth";

export const chatRouters = new Elysia({ prefix: "/chats" })
  .use(authPlugin)

  .post(
    "/create",
    async (ctx: any) => {
      const { userId, body, set } = ctx;
      const { targetUserId } = body;

      if (targetUserId === userId) {
        set.status = 400;
        return { error: "Cannot create chat with yourself ❌" };
      }
      const myChats = db
        .select({ id: chatMembers.chatId })
        .from(chatMembers)
        .where(eq(chatMembers.userId, userId));

      const existingChats = await db
        .select({ chatId: chats.id })
        .from(chats)
        .innerJoin(chatMembers, eq(chatMembers.chatId, chats.id))
        .where(
          and(
            eq(chats.isGroup, false),
            eq(chatMembers.userId, targetUserId),
            inArray(chats.id, myChats),
          ),
        )
        .limit(1);
      if (existingChats.length > 0) {
        return {
          message: "Chat already exist ✅",
          chatId: existingChats[0]!.chatId,
        };
      }
      const [chat] = await db.transaction(async (tx) => {
        const [newChat] = await tx.insert(chats).values({}).returning();
        if (!newChat) throw new Error("Error creating chat");
        return [newChat];
      });
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
      const members = [...new Set([userId, ...memberIds])].map((id) => ({
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

      const requester = await db
        .select()
        .from(chatMembers)
        .where(
          and(
            eq(chatMembers.chatId, params.chatId),
            eq(chatMembers.userId, userId),
          ),
        );
      if (requester.length === 0) {
        set.status = 403;
        return { error: "You are not a member of this chat ❌" };
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

    if (params.memberId === userId) {
      set.status = 400;
      return { error: "Creator cannot remove Themselves ❌" };
    }
    const chat = await db
      .select()
      .from(chats)
      .where(and(eq(chats.id, params.chatId), eq(chats.createdBy, userId)));

    if (chat.length === 0) {
      set.status = 403;
      return { error: "Only creator can remove members ❌" };
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
      .select({ chatId: chats.id, name: chats.name, isGroup: chats.isGroup })
      .from(chatMembers)
      .innerJoin(chats, eq(chats.id, chatMembers.chatId))
      .where(eq(chatMembers.userId, userId));
    return userChats;
  })

  .get("/:chatId/message", async (ctx: any) => {
    const { userId, params, set, query } = ctx;
    const limit = Number(query.limit) || 20;
    const cursor = query.cursor as string | undefined;

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
      .where(
        and(
          eq(messages.chatId, params.chatId),
          cursor ? lt(messages.id, cursor) : undefined,
        ),
      )
      .orderBy(desc(messages.createdAt))
      .limit(limit);

    const nextCursor =
      chatMessages.length === limit
        ? chatMessages[chatMessages.length - 1]!.id
        : null;
    return { messages: chatMessages, nextCursor };
  })

  .post("/:chatId/read", async (ctx: any) => {
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

    await db
      .update(messages)
      .set({ isRead: true })
      .where(
        and(eq(messages.chatId, params.chatId), ne(messages.senderId, userId)),
      );
    return { message: "Messages marked as read ✅" };
  })

  .delete("/:chatId/messages/:messageId", async (ctx: any) => {
    const { userId, params, set } = ctx;
    const [message] = await db
      .select()
      .from(messages)
      .where(eq(messages.id, params.messageId));
    if (!message) {
      set.status = 404;
      return { error: "Message not found ❌" };
    }
    if (message.senderId !== userId) {
      set.status = 403;
      return { error: "You can only delete your own messages ❌" };
    }

    await db.delete(messages).where(eq(messages.id, params.messageId));
    return { message: "Message deleted ✅" };
  })

  .patch(
    "/:chatId/messages/:messageId",
    async (ctx: any) => {
      const { userId, params, body, set } = ctx;
      const [message] = await db
        .select()
        .from(messages)
        .where(eq(messages.id, params.messageId));
      if (!message) {
        set.status = 404;
        return { error: "Message not found ❌" };
      }
      if (message.senderId !== userId) {
        set.status = 403;
        return { error: "You can only edit your own messages ❌" };
      }
      const [updated] = await db
        .update(messages)
        .set({ text: body.text })
        .where(eq(messages.id, params.messageId))
        .returning();
      if (!updated) {
        set.status = 500;
        return { error: "Error updating message ❌" };
      }
      return { message: "Message updated ✅", data: updated };
    },
    { body: t.Object({ text: t.String({ minLength: 1 }) }) },
  );
