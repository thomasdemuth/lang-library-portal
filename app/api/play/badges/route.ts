import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { guarded, requireSession } from "@/lib/guards";
import { loadCollections } from "@/lib/collections";
import { isCategoryId } from "@/lib/tags";
import { earnedSlugs, emptyStats, type BadgeStats } from "@/lib/badges";
import type { CategoryId } from "@/lib/categories";

/** The reading log we'll join to book_tags. Generous, but bounded. */
const LOG_SCAN = 1000;

function badgesMissingTable(message: string | undefined): boolean {
  return /student_badges|relation|does not exist|schema cache/i.test(message ?? "");
}

/**
 * Everything the badge definitions measure, in one pass. Each count sits in
 * its own try/catch so a table that predates its migration reads as 0 rather
 * than failing the whole request — the same grace every other play route
 * gives (see app/api/play/profile/route.ts).
 */
async function gatherStats(email: string): Promise<BadgeStats> {
  const stats = emptyStats();

  // Reading log: the count, and the book keys that give us genres.
  let bookKeys: string[] = [];
  try {
    const [{ count }, { data }] = await Promise.all([
      db().from("reading_log").select("id", { count: "exact", head: true }).eq("email", email),
      db().from("reading_log").select("book_key").eq("email", email).limit(LOG_SCAN),
    ]);
    stats.booksLogged = count ?? 0;
    bookKeys = (data ?? []).map((r) => r.book_key);
  } catch {
    /* pre-migration */
  }

  // Genres come from book_tags, which is keyed by the same dedupe_key the
  // reading log stores (see 0008_books_tagged_view.sql).
  if (bookKeys.length > 0) {
    try {
      const { data } = await db().from("book_tags").select("category").in("book_key", bookKeys);
      const seen = new Set<CategoryId>();
      for (const row of data ?? []) if (isCategoryId(row.category)) seen.add(row.category);
      stats.genres = [...seen];
    } catch {
      /* pre-migration */
    }
  }

  try {
    const { count } = await db()
      .from("favorites")
      .select("id", { count: "exact", head: true })
      .eq("email", email);
    stats.favorites = count ?? 0;
  } catch {
    /* pre-migration */
  }

  try {
    const cols = await loadCollections(email);
    if (Array.isArray(cols)) {
      stats.listsWithBooks = cols.filter((c) => c.books.length > 0).length;
      stats.booksInLists = cols.reduce((n, c) => n + c.books.length, 0);
    }
  } catch {
    /* pre-migration */
  }

  try {
    const base = () =>
      db().from("checkouts").select("id", { count: "exact", head: true }).eq("student_email", email);
    const [all, back] = await Promise.all([base(), base().not("returned_at", "is", null)]);
    stats.takenHome = all.count ?? 0;
    stats.broughtBack = back.count ?? 0;
  } catch {
    /* pre-migration */
  }

  try {
    const { count } = await db().from("friends").select("id", { count: "exact", head: true }).eq("email", email);
    stats.friends = count ?? 0;
  } catch {
    /* pre-migration */
  }

  return stats;
}

type LedgerRow = { slug: string; earned_at: string; seen_at: string | null };

/**
 * Bring the ledger in line with what the student has actually earned, and
 * report back which badges still owe a celebration.
 *
 * The first sync for a student is special. Someone who has been reading here
 * all term qualifies for six badges at once, and six modals in a row is a
 * punishment, not a reward — so a first sync of more than one badge is
 * back-stamped as already seen. Their collection is simply *there* on My Page,
 * which reads as a gift. A brand-new reader whose first sync yields exactly
 * one badge still gets the pop.
 */
async function syncLedger(
  email: string,
  earned: string[]
): Promise<{ rows: LedgerRow[]; unseen: string[] } | "missing-table"> {
  const { data, error } = await db()
    .from("student_badges")
    .select("slug, earned_at, seen_at")
    .eq("email", email);
  if (error) return badgesMissingTable(error.message) ? "missing-table" : { rows: [], unseen: [] };

  const rows = (data ?? []) as LedgerRow[];
  const known = new Set(rows.map((r) => r.slug));
  const fresh = earned.filter((slug) => !known.has(slug));

  if (fresh.length > 0) {
    const silent = rows.length === 0 && fresh.length > 1;
    const now = new Date().toISOString();
    const { error: insErr } = await db()
      .from("student_badges")
      .insert(fresh.map((slug) => ({ email, slug, seen_at: silent ? now : null })));
    if (insErr) {
      if (badgesMissingTable(insErr.message)) return "missing-table";
      // A duplicate means a concurrent request already wrote the row, and any
      // other error means we don't know what landed. Either way, don't invent
      // ledger rows here — the next load reads the truth and celebrates then.
    } else {
      for (const slug of fresh) rows.push({ slug, earned_at: now, seen_at: silent ? now : null });
    }
  }

  // Only badges still derived as earned may celebrate. (Nothing un-earns
  // today, but a future definition change must not pop a stale row.)
  const stillEarned = new Set(earned);
  return { rows, unseen: rows.filter((r) => !r.seen_at && stillEarned.has(r.slug)).map((r) => r.slug) };
}

/**
 * Does this student still owe a welcome? Pre-0027 the column isn't there, and
 * we answer `true` — the client then suppresses it from its own localStorage,
 * so a new student gets the welcome before the migration runs and a returning
 * one doesn't see it twice in the same browser.
 */
async function loadWelcome(email: string): Promise<boolean> {
  const { data, error } = await db()
    .from("student_profiles")
    .select("welcomed_at")
    .eq("email", email)
    .maybeSingle();
  if (error) return true;
  return !data?.welcomed_at;
}

// Written to on every call, and read straight after a mutation — never cache.
const NO_STORE = { "Cache-Control": "private, no-store" };

/** My badge collection: the stats behind it, what's earned, what's unseen. */
export const GET = guarded(async (req: NextRequest) => {
  const session = await requireSession(req);
  // Badges are a student thing. Staff and guests browse the same catalog
  // components, so answer them plainly instead of 403-ing a shared surface.
  if (session.aud !== "student") {
    return NextResponse.json({ stats: emptyStats(), earned: [], unseen: [] }, { headers: NO_STORE });
  }

  const stats = await gatherStats(session.email);
  const earned = earnedSlugs(stats);
  const [ledger, welcome] = await Promise.all([syncLedger(session.email, earned), loadWelcome(session.email)]);

  if (ledger === "missing-table") {
    // Pre-0027: the shelf still works off derived badges, and the client
    // remembers what it has already celebrated in localStorage.
    return NextResponse.json(
      {
        stats,
        earned: earned.map((slug) => ({ slug, earned_at: null })),
        unseen: earned,
        welcome: welcome || undefined,
        migrationPending: true,
      },
      { headers: NO_STORE }
    );
  }

  return NextResponse.json(
    {
      stats,
      earned: ledger.rows.map((r) => ({ slug: r.slug, earned_at: r.earned_at })),
      unseen: ledger.unseen,
      welcome: welcome || undefined,
    },
    { headers: NO_STORE }
  );
});

const Body = z.union([
  z.object({ action: z.literal("seen"), slugs: z.array(z.string().max(60)).max(30) }),
  z.object({ action: z.literal("welcomed") }),
]);

/** Mark celebrations as shown, so they never fire twice. */
export const POST = guarded(async (req: NextRequest) => {
  const session = await requireSession(req);
  if (session.aud !== "student") return NextResponse.json({ ok: true });

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  if (parsed.data.action === "welcomed") {
    const { error } = await db()
      .from("student_profiles")
      .update({ welcomed_at: new Date().toISOString() })
      .eq("email", session.email);
    // Pre-0027 the column isn't there; the client's localStorage covers it.
    return NextResponse.json({ ok: true, migrationPending: Boolean(error) });
  }

  if (parsed.data.slugs.length === 0) return NextResponse.json({ ok: true });
  const { error } = await db()
    .from("student_badges")
    .update({ seen_at: new Date().toISOString() })
    .eq("email", session.email)
    .in("slug", parsed.data.slugs)
    .is("seen_at", null);
  return NextResponse.json({ ok: true, migrationPending: Boolean(error && badgesMissingTable(error.message)) });
});
