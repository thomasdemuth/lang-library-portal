import nodemailer, { type Transporter } from "nodemailer";
import { db } from "@/lib/db";
import type { AdminRole } from "@/lib/permissions";

/**
 * All outgoing mail is sent AS library@thelangschool.org through Gmail's own
 * SMTP server with an app password — Google signs the mail, so SPF/DKIM pass
 * with zero DNS setup. Free (~2k msgs/day on Workspace).
 *
 * - Without GMAIL_USER/GMAIL_APP_PASSWORD, emails are logged instead (dev mode).
 * - With EMAIL_OVERRIDE_TO set, ALL mail reroutes to that one inbox and the
 *   subject gains a "[for: …]" suffix showing the true recipients.
 * - Sending never throws: a mail failure must never take a request down.
 * Node runtime only (route handlers + cron) — never imported from middleware.
 */

let transport: Transporter | null = null;

function smtp(): Transporter | null {
  const user = process.env.GMAIL_USER;
  const pass = process.env.GMAIL_APP_PASSWORD;
  if (!user || !pass) return null;
  if (!transport) {
    transport = nodemailer.createTransport({
      host: "smtp.gmail.com",
      port: 465,
      secure: true,
      auth: { user, pass },
    });
  }
  return transport;
}

export async function sendEmail(to: string[], subject: string, text: string): Promise<void> {
  if (to.length === 0) return;
  const override = process.env.EMAIL_OVERRIDE_TO?.trim();
  const recipients = override ? [override] : to;
  const finalSubject = override ? `${subject} [for: ${to.join(", ")}]` : subject;

  const t = smtp();
  if (!t) {
    console.log(`[email dev-log] to=${recipients.join(",")} subject="${finalSubject}"\n${text}`);
    return;
  }
  try {
    await t.sendMail({
      from: `"Lang Library" <${process.env.GMAIL_USER}>`,
      to: recipients,
      subject: finalSubject,
      text,
    });
  } catch (e) {
    console.error("email send failed:", e);
  }
}

type AdminEmailRow = {
  email: string;
  role?: AdminRole | null;
  notify_requests?: boolean | null;
  notify_weekly?: boolean | null;
};

function isMissingColumn(message: string | undefined): boolean {
  return /role|permissions|notify_weekly|column/i.test(message ?? "");
}

/**
 * New-request alerts go to Chief Admins who haven't muted them.
 * Pre-migration-0004 fallback: every admin counts as chief (matches the
 * guard fallback used across the codebase).
 */
export async function notifyChiefEmails(): Promise<string[]> {
  const { data, error } = await db()
    .from("admins")
    .select("email, role, notify_requests")
    .eq("notify_requests", true)
    .is("disabled_at", null);
  if (error && isMissingColumn(error.message)) {
    const retry = await db()
      .from("admins")
      .select("email, notify_requests")
      .eq("notify_requests", true)
      .is("disabled_at", null);
    return (retry.data ?? []).map((a) => a.email);
  }
  return ((data ?? []) as AdminEmailRow[])
    .filter((a) => a.role === "chief")
    .map((a) => a.email);
}

/**
 * Weekly digest recipients: notify_weekly overrides when set; when null the
 * role decides (chiefs in, regular admins out).
 */
export async function weeklyDigestEmails(): Promise<string[]> {
  const { data, error } = await db()
    .from("admins")
    .select("email, role, notify_weekly")
    .is("disabled_at", null);
  if (error && isMissingColumn(error.message)) {
    // Pre-0005 (no notify_weekly): chiefs get it. Pre-0004 too: everyone is chief.
    const retry = await db().from("admins").select("email, role").is("disabled_at", null);
    if (retry.error && isMissingColumn(retry.error.message)) {
      const bare = await db().from("admins").select("email").is("disabled_at", null);
      return (bare.data ?? []).map((a) => a.email);
    }
    if (retry.error) return [];
    return ((retry.data ?? []) as AdminEmailRow[])
      .filter((a) => a.role === "chief")
      .map((a) => a.email);
  }
  return ((data ?? []) as AdminEmailRow[])
    .filter((a) => a.notify_weekly ?? a.role === "chief")
    .map((a) => a.email);
}
