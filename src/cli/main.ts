// Run `npm start` to start the demo
import { cancel, intro, isCancel, outro, select } from "@clack/prompts";
import color from "picocolors";
import { buildHugoAivApp } from "./hugo-aiv/buildHugoAivApp";

export async function runMainCli() {
  intro(color.inverse(" App Builder "));

  const projectName = await select({
    message: "Select the project to be build.",
    options: [{ value: "hugoAiv", label: "hugo-aiv-app" }],
  });

  if (isCancel(projectName)) {
    cancel("Operation cancelled");
    return process.exit(0);
  }

  if (projectName === "hugoAiv") {
    await buildHugoAivApp();
  }

  outro("Finish!");
}

if (require.main === module) {
  runMainCli().catch(console.error);
}
