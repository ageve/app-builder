import { GetCorsTokenParams } from "../types";
import { setTaskName } from "../utils/common";
import { uploadPgyer } from "../utils/pgyer";

export async function uploadPgyerTask(context: any, data: GetCorsTokenParams) {
  try {
    const { buildAndroid } = context;
    const { productFiles } = buildAndroid;
    const target = (productFiles as string[]).find((it) =>
      it.includes("universal")
    );
    if (!target) return false;
    await uploadPgyer({
      getCorsTokenData: data,
      uploadData: {
        productFile: target,
      },
    });
    return true;
  } catch (error) {
    console.log(error);
  }
  return false;
}

export default function createUploadPgyer(data: GetCorsTokenParams) {
  const task = (context: any) => uploadPgyerTask(context, data);
  setTaskName("uploadPgyer", task);
  return task;
}
