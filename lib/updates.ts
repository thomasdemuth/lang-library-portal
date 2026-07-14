import webpush from "web-push";
import { db } from "@/lib/db";

/**
 * Who can publish app updates (the developer). Both spellings of
 * Thomas's address are accepted — the admin account currently uses the
 * students-domain one.
 */
const UPDATE_AUTHORS = new Set(["thomas.demuth@thelangschool.org", "thomas.demuth@students.thelangschool.org"]);

export function canPublishUpdates(email: string): boolean {
  return UPDATE_AUTHORS.has(email.toLowerCase());
}

export function pushConfigured(): boolean {
  return Boolean(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
}

type PushRow = { id: number; endpoint: string; p256dh: string; auth: string };

/**
 * Push an update notification to every recipient device. Recipients are
 * active admins; those who opted out (notify_updates = false) are skipped
 * unless `override` is set. Dead subscriptions (404/410) are pruned.
 * Returns how many devices were reached.
 */
export async function pushUpdateToAdmins(
  title: string,
  body: string,
  override: boolean
): Promise<{ sent: number; devices: number }> {
  if (!pushConfigured()) return { sent: 0, devices: 0 };
  webpush.setVapidDetails(
    "mailto:library@thelangschool.org",
    process.env.VAPID_PUBLIC_KEY!,
    process.env.VAPID_PRIVATE_KEY!
  );

  const { data: admins } = await db().from("admins").select("id, disabled_at, notify_updates");
  const recipients = new Set(
    (admins ?? [])
      .filter((a) => !a.disabled_at && (override || a.notify_updates !== false))
      .map((a) => a.id as string)
  );
  if (recipients.size === 0) return { sent: 0, devices: 0 };

  const { data: subs } = await db()
    .from("push_subscriptions")
    .select("id, admin_id, endpoint, p256dh, auth");
  const targets = ((subs ?? []) as (PushRow & { admin_id: string })[]).filter((s) =>
    recipients.has(s.admin_id)
  );

  const payload = JSON.stringify({ title: `📣 ${title}`, body, url: "/admin/updates" });
  let sent = 0;
  await Promise.all(
    targets.map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          payload,
          { TTL: 24 * 3600 }
        );
        sent++;
      } catch (e) {
        const status = (e as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) {
          await db().from("push_subscriptions").delete().eq("id", s.id);
        }
      }
    })
  );
  return { sent, devices: targets.length };
}
