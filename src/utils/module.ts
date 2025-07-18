import { log } from "@clack/prompts";
import { constants } from "fs";
import { access } from "fs/promises";
import { err, Err, Ok, ok } from "neverthrow";
import { pathToFileURL } from "url";
import z, { ZodError } from "zod";

export async function importIfExistsAndValidate<T>(
  filePath: string,
  schema: z.ZodType<T>
): Promise<Ok<T, never> | Err<string, string>> {
  try {
    await access(filePath, constants.F_OK);
    const { default: mod } = await import(pathToFileURL(filePath).toString());
    log.info("config " + JSON.stringify(mod, null, 2));
    // Zod 校验
    return ok(schema.parse(mod));
  } catch (error) {
    if (error instanceof ZodError) {
      return err(`Config read failed, ${error.message}`);
    }
    return err("Config file does not exit");
  }
}
