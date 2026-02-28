import { Elysia, t } from "elysia";
import { uploadFile } from "../utils/cloudinary";
import { authPlugin } from "../middleware/auth";

export const uploadRoutes = new Elysia({ prefix: "/upload" })
  .use(authPlugin)
  .post(
    "/file",
    async ({ body, set }: any) => {
      const { file } = body;
      if (!file) {
        set.status = 400;
        return { error: "No file provided ❌" };
      }

      const buffer = await file.arrayBuffer();
      const base64 = Buffer.from(buffer).toString("base64");
      const dataUri = `data:${file.type};base64,${base64}`;

      const url = await uploadFile(dataUri);
      return { url, message: "File uploaded ✅" };
    },
    {
      body: t.Object({
        file: t.File(),
      }),
    },
  );
