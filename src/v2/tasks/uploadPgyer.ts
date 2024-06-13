import { GetCorsTokenParams } from "../types";
import { setTaskName } from "../utils/common";
import { uploadPgyer } from "../utils/pgyer";

export async function uploadPgyerTask(context: any, data: GetCorsTokenParams) {
  try {
    const { buildAndroid } = context;
    await uploadPgyer({
      getCorsTokenData: data,
      uploadData: {
        productFile: buildAndroid.productFile,
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
