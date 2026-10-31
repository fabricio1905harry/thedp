import { headers } from "next/headers";
import { SITE_MODE_HEADER } from "@/lib/site-mode";
import { operationForSiteMode, type OperationCode } from "@/lib/cms-types";

/** Operation of the current request (Brazil mirror vs international); catalog items can be hidden per operation. */
export async function currentOperation(): Promise<OperationCode> {
  try {
    return operationForSiteMode((await headers()).get(SITE_MODE_HEADER));
  } catch {
    return "intl_b2b";
  }
}

export const visibleIn = (ops: string[] | null | undefined, op: string) => !Array.isArray(ops) || ops.includes(op);
