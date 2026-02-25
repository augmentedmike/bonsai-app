import { defineConfig } from "drizzle-kit";

const dbFile = process.env.BONSAI_ENV === "dev" ? "./.data/bonsai-dev.db" : "./.data/bonsai.db";

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "sqlite",
  dbCredentials: {
    url: dbFile,
  },
});
