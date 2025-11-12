import { z } from "zod";

export const configSchema = z.object({
  gitUri: z.string(),
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
  appInfo: z.object({ name: z.string, slogan: z.string() }).optional(),
  appStore: z.object({ keychain: z.string() }).optional(),
});

export type Config = z.infer<typeof configSchema>;
export const buildConfig = (c: Config) => c;

export const argsSchema = z.object({
  autoVersionCode: z.boolean().optional(),
  legacyVersioning: z.boolean().optional(),
  dryRun: z.boolean().optional(),
});

export type Args = z.infer<typeof argsSchema>;
