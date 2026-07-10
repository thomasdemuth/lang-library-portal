import { Resend } from "resend";
import { db } from "@/lib/db";

/**
 * All outgoing mail funnels through here. Until a sending domain is verified
 * with Resend, set EMAIL_OVERRIDE_TO to route everything to one inbox.
 * Without RESEND_API_KEY, emails are logged instead of sent (dev mode).
 */
export async function sendEmail(to: string[], subject: string, text: string): Promise<void> {
  const override = process.env.EMAIL_OVERRIDE_TO?.trim();
  const recipients = override ? [override] : to;
  const finalSubject = override && to.length ? `${subject} [for: ${to.join(", ")}]` : subject;

  const key = process.env.RESEND_API_KEY;
  if (!key) {
    console.log(`[email dev-log] to=${recipients.join(",")} subject="${finalSubject}"\n${text}`);
    return;
  }
  try {
    const resend = new Resend(key);
    await resend.emails.send({
      from: process.env.EMAIL_FROM ?? "Lang Library <onboarding@resend.dev>",
      to: recipients,
      subject: finalSubject,
      text,
    });
  } catch (e) {
    // Email must never take a request down
    console.error("email send failed:", e);
  }
}

/** Emails of active admins who want request notifications. */
export async function notifyAdminEmails(): Promise<string[]> {
  const { data } = await db()
    .from("admins")
    .select("email, notify_requests, disabled_at")
    .eq("notify_requests", true)
    .is("disabled_at", null);
  return (data ?? []).map((a) => a.email);
}
