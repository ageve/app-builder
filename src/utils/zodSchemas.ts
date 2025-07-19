import { z } from "zod";

export const configSchema = z.object({
  gitUri: z.string(),
  pgkManager: z.enum(["bun", "npm", "pnpm", "yarn"]),
  pgyer: z
    .object({
      apiKey: z.string(),
      buildType: z.literal("apk"),
    })
    .optional(),

  notifyBusinessWechat: z
    .object({
      webhook: z.string(),
    })
    .optional(),

  fir: z
    .object({
      apiKey: z.string(),
    })
    .optional(),

  uploadApi: z
    .object({
      alpha: z.string(),
      prod: z.string(),
    })
    .optional(),

  updateUrl: z
    .object({
      alpha: z.string(),
      prod: z.string(),
    })
    .optional(),
});

export type Config = z.infer<typeof configSchema>;
