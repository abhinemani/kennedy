"use server";

import { redirect } from "next/navigation";
import { linkFor } from "@/db/queries/respondent";
import { suppressEmail } from "@/db/queries/suppression";
import { sameOrigin } from "@/lib/request";

export async function confirmUnsubscribe(formData: FormData): Promise<void> {
  const token = String(formData.get("token") ?? "");
  if (!(await sameOrigin())) redirect(`/u/${token}`);

  const link = await linkFor(token);
  if (!link) redirect(`/u/${token}`);

  // A global suppression holds across every study (spec section 3).
  await suppressEmail(link.email, "unsubscribed");
  redirect(`/u/${token}?done=1`);
}
