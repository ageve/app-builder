import { log } from "@clack/prompts";
import leven from "leven";
import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import { z, ZodType } from "zod";

export function parseAndValidateArgs<T extends ZodType>({
  schema,
  allowedKeys,
  description,
}: {
  schema: T;
  allowedKeys: string[];
  description: Record<string, string>;
}): z.infer<T> {
  const rawArgv = yargs(hideBin(process.argv)).parse() as Record<string, any>;

  const inputKeys = Object.keys(rawArgv).filter(
    (k) => !["_", "$0"].includes(k)
  );

  // log.info("rawArgv" + JSON.stringify(rawArgv));

  const invalidKeys = inputKeys.filter((k) => !allowedKeys.includes(k));

  if (invalidKeys.length > 0) {
    log.error("❌ Invalid parameters detected:");

    invalidKeys.forEach((key) => {
      log.error(`  --${key}`);

      const suggestions = allowedKeys
        .map((allowed) => ({
          key: allowed,
          dist: leven(key, allowed),
        }))
        .sort((a, b) => a.dist - b.dist)
        .filter((s) => s.dist <= 3);

      if (suggestions.length > 0) {
        let explain = "";
        if (suggestions[0].key in description) {
          explain = description[suggestions[0].key];
        }
        log.error(`  👉 Did you mean --${suggestions[0].key} ? (${explain})`);
      }
    });

    process.exit(1);
  }

  return schema.parse(rawArgv);
}
