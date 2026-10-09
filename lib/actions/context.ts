import { requestContext, type RequestContextResult } from "../data/context";

export type ActionContext = RequestContextResult;
export type ActionContextResult = RequestContextResult;

export async function actionContext(): Promise<RequestContextResult> {
  return requestContext();
}

export { isContextError } from "../data/context";
