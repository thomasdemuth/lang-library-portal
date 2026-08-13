"use client";

import { useCallback, useEffect, useState } from "react";
import { withBase } from "@/lib/base";

type Feedback = {
  id: number;
  /** "public" = an anonymous QR scan in the library. */
  audience: "student" | "staff" | "public";
  email: string | null;
  name: string | null;
  /** Null when someone answered with stars and chips only. */
  message: string | null;
  status: "new" | "read" | "archived";
  created_at: string;
  // All below are null/absent until migration 0024 has been run.
  rating?: number | null;
  tags?: string[] | null;
  topic?: "website" | "library" | null;
  spot?: string | null;
  source?: "form" | "banner" | "qr" | null;
};

type Stats = Record<"website" | "library", { count: number; average: number }>;

const FILTERS = ["new", "read", "archived", "all"] as const;
const TOPIC_FILTERS = [
  { key: "", label: "Everything" },
  { key: "website", label: "Website" },
  { key: "library", label: "Library" },
] as const;

const AUDIENCE_TINT: Record<string, string> = {
  student: "#e9f0fd",
  staff: "#e7f6f3",
  public: "#f1ecfb",
};

/** "★★★★☆" — compact enough to sit inline in the meta line. */
function stars(rating: number): string {
  return "★".repeat(rating) + "☆".repeat(Math.max(0, 5 - rating));
}

export default function AdminFeedbackPanel({ canManage }: { canManage: boolean }) {
  const [items, setItems] = useState<Feedback[]>([]);
  const [newCount, setNewCount] = useState(0);
  const [total, setTotal] = useState(0);
  const [stats, setStats] = useState<Stats | null>(null);
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("new");
  const [topic, setTopic] = useState<string>("");
  const [q, setQ] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);

  const load = useCallback(
    async (offset = 0) => {
      const params = new URLSearchParams();
      if (filter !== "all") params.set("status", filter);
      if (topic) params.set("topic", topic);
      if (q.trim()) params.set("q", q.trim());
      if (offset > 0) params.set("offset", String(offset));
      const qs = params.toString();
      try {
        const res = await fetch(withBase(`/api/admin/feedback${qs ? `?${qs}` : ""}`));
        const data = await res.json();
        if (!res.ok) {
          setError(data.error ?? "Couldn't load feedback.");
          return;
        }
        setItems((cur) => (offset > 0 ? [...cur, ...data.feedback] : data.feedback));
        setNewCount(data.newCount);
        setTotal(data.total ?? data.feedback.length);
        setStats(data.stats ?? null);
      } catch {
        setError("Couldn't reach the server — try again.");
      }
    },
    [filter, topic, q]
  );

  // Reload on filter change immediately; debounce while typing a search.
  useEffect(() => {
    const t = setTimeout(() => load(0), q.trim() ? 250 : 0);
    return () => clearTimeout(t);
  }, [load, q]);

  async function setStatus(id: number, status: Feedback["status"]) {
    setError(null);
    try {
      const res = await fetch(withBase(`/api/admin/feedback/${id}`), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "Couldn't update that feedback — try again.");
      }
    } catch {
      setError("Couldn't reach the server — that feedback wasn't updated.");
    }
    load();
  }

  async function showMore() {
    setLoadingMore(true);
    try {
      await load(items.length);
    } finally {
      setLoadingMore(false);
    }
  }

  return (
    <>
      {error && <div className="error">{error}</div>}

      <div style={{ display: "flex", gap: 6, marginBottom: 12, flexWrap: "wrap", alignItems: "center" }}>
        {FILTERS.map((f) => (
          <button
            key={f}
            className="btn"
            style={filter === f ? { background: "var(--ink)", color: "#fff", borderColor: "var(--ink)" } : undefined}
            onClick={() => setFilter(f)}
          >
            {f[0].toUpperCase() + f.slice(1)}
            {f === "new" && newCount > 0 ? ` (${newCount})` : ""}
          </button>
        ))}
        <input
          className="input"
          type="search"
          style={{ maxWidth: 260, marginLeft: "auto" }}
          placeholder="Search messages…"
          aria-label="Search feedback messages"
          value={q}
          maxLength={200}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>

      <div style={{ display: "flex", gap: 6, marginBottom: 12, flexWrap: "wrap", alignItems: "center" }}>
        {TOPIC_FILTERS.map((t) => (
          <button
            key={t.key}
            className={`tagchip${topic === t.key ? " chip on" : ""}`}
            onClick={() => setTopic(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {stats && stats.website.count + stats.library.count > 0 && (
        <p className="hint" style={{ margin: "0 0 12px" }}>
          New site: <b>{stats.website.average || "—"}</b>
          {stats.website.count > 0 && ` ★ from ${stats.website.count}`}
          {" · "}
          Library: <b>{stats.library.average || "—"}</b>
          {stats.library.count > 0 && ` ★ from ${stats.library.count}`}
        </p>
      )}

      <p className="hint" style={{ margin: "0 0 12px" }}>
        Showing {items.length} of {total}
        {q.trim() ? ` matching “${q.trim()}”` : ""}
        {filter === "all" ? "" : ` ${filter}`} feedback item{total === 1 ? "" : "s"}.
      </p>

      {items.length === 0 ? (
        <div className="card">
          <p className="hint" style={{ margin: 0 }}>
            No {filter === "all" ? "" : filter + " "}feedback{q.trim() ? ` matching “${q.trim()}”` : ""}.
          </p>
        </div>
      ) : (
        items.map((f) => (
          <div className="card" key={f.id} style={{ marginBottom: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 14, flexWrap: "wrap" }}>
              <p className="hint" style={{ margin: 0 }}>
                <span
                  className="pill"
                  style={{ background: AUDIENCE_TINT[f.audience] ?? "#e7f6f3", marginRight: 8 }}
                >
                  {f.audience === "public" ? "anonymous" : f.audience}
                </span>
                {f.topic && (
                  <span className="pill" style={{ background: "#eee9dc", marginRight: 8 }}>
                    {f.topic === "website" ? "website" : f.spot && f.spot !== "library" ? f.spot : "library"}
                  </span>
                )}
                {f.source === "qr" && (
                  <span className="pill" style={{ background: "#eee9dc", marginRight: 8 }}>
                    QR
                  </span>
                )}
                {f.source === "banner" && (
                  <span className="pill" style={{ background: "#eee9dc", marginRight: 8 }}>
                    banner
                  </span>
                )}
                {/* An anonymous QR row has neither name nor email — the
                    audience pill above already says so. */}
                {[f.name, f.email].filter(Boolean).join(" · ")}
                {f.name || f.email ? " · " : ""}
                {new Date(f.created_at).toLocaleString()}
              </p>
              <span style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {f.email && (
                  <a
                    className="btn"
                    href={`mailto:${f.email}?subject=${encodeURIComponent("Re: your Lang Library feedback")}`}
                  >
                    Reply by email
                  </a>
                )}
                {canManage && f.status !== "read" && (
                  <button className="btn" onClick={() => setStatus(f.id, "read")}>
                    Mark read
                  </button>
                )}
                {canManage && f.status !== "archived" && (
                  <button className="btn ghost" onClick={() => setStatus(f.id, "archived")}>
                    Archive
                  </button>
                )}
              </span>
            </div>
            {typeof f.rating === "number" && (
              <p style={{ margin: "10px 0 0", fontSize: 17, letterSpacing: 2, color: "#E8A317" }}>
                <span aria-hidden>{stars(f.rating)}</span>
                <span className="sr-only">{f.rating} out of 5 stars</span>
              </p>
            )}
            {f.tags && f.tags.length > 0 && (
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
                {f.tags.map((tag) => (
                  <span key={tag} className="tagpill" style={{ background: "#5a6474", fontSize: 11, padding: "3px 10px" }}>
                    {tag}
                  </span>
                ))}
              </div>
            )}
            {f.message && <p style={{ margin: "10px 0 0", whiteSpace: "pre-wrap" }}>{f.message}</p>}
            {!f.message && typeof f.rating !== "number" && !f.tags?.length && (
              <p className="hint" style={{ margin: "10px 0 0" }}>
                (no message)
              </p>
            )}
          </div>
        ))
      )}

      {items.length < total && (
        <div style={{ textAlign: "center", marginTop: 4 }}>
          <button className="btn" onClick={showMore} disabled={loadingMore}>
            {loadingMore ? "Loading…" : `Show more (${total - items.length} left)`}
          </button>
        </div>
      )}
    </>
  );
}
