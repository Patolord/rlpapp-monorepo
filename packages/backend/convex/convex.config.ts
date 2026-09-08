import { defineApp } from "convex/server";
import { v } from "convex/values";
import workpool from "@convex-dev/workpool/convex.config";
import aggregate from "@convex-dev/aggregate/convex.config";

const app = defineApp({
  env: {
    CLERK_SECRET_KEY: v.string(),
    CLERK_WEBHOOK_SECRET: v.optional(v.string()),
    OPENAI_API_KEY: v.optional(v.string()),
    RHID_EMAIL: v.optional(v.string()),
    RHID_PASSWORD: v.optional(v.string()),
    RHID_DOMAIN: v.optional(v.string()),
    RHID_MEDIA_ALLOWED_HOSTS: v.optional(v.string()),
    RHID_WEB_ORIGIN: v.optional(v.string()),
  },
});
app.use(workpool, { name: "attendanceWorkpool" });
app.use(aggregate, { name: "attendanceCounts" });

export default app;
