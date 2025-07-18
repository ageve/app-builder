// Run `npm start` to start the demo
import { cancel, intro, isCancel, outro, select } from "@clack/prompts";
import color from "picocolors";
import { buildHugoAivApp } from "./hugo-aiv/buildHugoAivApp";
import { buildHugoGameApp } from "./hugo-game/buildHugoGameApp";

async function main() {
  intro(color.inverse(" App Builder "));

  const projectName = await select({
    message: "Select the project to be build.",
    options: [
      { value: "hugoAiv", label: "hugo-aiv-app" },
      // { value: "hugoGame", label: "hugo-game-app" },
    ],
  });

  if (isCancel(projectName)) {
    cancel("Operation cancelled");
    return process.exit(0);
  }

  if (projectName === "hugoAiv") {
    await buildHugoAivApp();
  } else {
    await buildHugoGameApp();
  }

  outro("Finish!");
}

main().catch(console.error);
