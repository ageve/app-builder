import { createReadonlyConnect, listPipelines } from "../../utils";

export async function handlePipeline() {
  const db = await createReadonlyConnect();
  try {
    const pipelines = await listPipelines(db);
    return {
      count: pipelines.length,
      pipelines: pipelines.map((item: Record<string, any>) => ({
        pipeId: item.pipe_id,
        projectName: item.project_name,
        env: item.env ?? null,
        branch: item.branch ?? null,
        platform: item.platform ?? null,
        workspace: item.workspace ?? null,
      })),
    };
  } finally {
    await db.close();
  }
}
