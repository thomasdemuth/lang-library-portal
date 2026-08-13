"use client";

import { useCallback, useEffect, useState } from "react";
import BannerBody from "@/components/BannerBody";
import BannerFormModal from "@/components/BannerFormModal";
import { withBase } from "@/lib/base";
import { describeBanner, toClientBanner, type BannerRow, type BannerState } from "@/lib/banners";

const STATE_LABEL: Record<BannerState, string> = {
  live: "Live now",
  scheduled: "Scheduled",
  waiting: "Waiting",
  ended: "Ended",
  off: "Off",
};

const AUDIENCE_LABEL: Record<string, string> = {
  all: "Everyone",
  student: "Students",
  staff: "Teachers",
};

const when = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : null;

/** "3 Mar → 9 Mar", "→ 9 Mar", "3 Mar →", or "Always". */
function windowText(row: BannerRow): string {
  const from = when(row.starts_at);
  const to = when(row.ends_at);
  if (!from && !to) return "Always";
  return `${from ?? "Now"} → ${to ?? "no end"}`;
}

export default function BannersPanel() {
  const [rows, setRows] = useState<BannerRow[] | null>(null);
  const [migration, setMigration] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<BannerRow | null | "new">(null);
  // Re-tick so a "Scheduled" row flips to "Live now" without a reload.
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  const load = useCallback(async () => {
    try {
      const res = await fetch(withBase("/api/admin/banners"));
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Couldn't load the banners.");
        setRows([]);
        return;
      }
      setError(null);
      setRows(data.banners ?? []);
      setMigration(Boolean(data.migrationPending));
    } catch {
      setError("Couldn't reach the server — try again.");
      setRows([]);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function onSaved(row: BannerRow) {
    setRows((cur) => {
      const list = cur ?? [];
      const i = list.findIndex((b) => b.id === row.id);
      return i >= 0 ? list.map((b) => (b.id === row.id ? row : b)) : [row, ...list];
    });
    setEditing(null);
  }

  async function toggle(row: BannerRow) {
    setError(null);
    try {
      const res = await fetch(withBase(`/api/admin/banners/${row.id}`), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: !row.enabled }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return setError(data.error ?? "Couldn't change that.");
      onSaved(data.banner as BannerRow);
    } catch {
      setError("Couldn't reach the server — nothing changed.");
    }
  }

  const list = rows ?? [];
  // What visitors are actually seeing right now — the thing you want to know
  // the moment you open this page. Usually one banner; more only when a
  // student-only and a teacher-only banner are running at the same time.
  const liveNow = list
    .map((row) => ({ row, who: describeBanner(row, list, now).liveFor }))
    .filter((x) => x.who.length > 0);

  return (
    <>
      {error && <div className="error">{error}</div>}
      {migration && (
        <div className="notice warn">
          Banners need migration 0025 — run <code>0025_banners.sql</code> in the Supabase SQL
          editor. Until then the site shows no banner.
        </div>
      )}

      <div className="card" style={{ marginBottom: 16 }}>
        <h2 style={{ marginBottom: 10 }}>Showing right now</h2>
        {liveNow.length > 0 ? (
          liveNow.map(({ row, who }) => (
            <div key={row.id} style={{ marginBottom: 8 }}>
              <p className="hint" style={{ margin: "0 0 6px" }}>
                {who.join(" · ")}
              </p>
              <div className="banner-preview">
                <BannerBody banner={toClientBanner(row)} preview />
              </div>
            </div>
          ))
        ) : (
          <p className="hint" style={{ margin: 0 }}>
            Nothing — no banner is live, so pages start at the top bar.
          </p>
        )}
      </div>

      <div className="card">
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
          <h2 style={{ margin: 0, flex: 1 }}>All banners</h2>
          <button className="gearbtn addbtn" onClick={() => setEditing("new")} aria-label="Write a new banner">
            +
          </button>
        </div>

        {rows === null ? (
          <p className="hint" style={{ margin: 0 }}>
            Loading banners…
          </p>
        ) : list.length === 0 ? (
          <p className="hint" style={{ margin: 0 }}>
            No banners yet. <b>+</b> writes one — it starts switched off, so you can get the wording
            right before anyone sees it.
          </p>
        ) : (
          <div className="tablewrap">
            <table className="table">
              <thead>
                <tr>
                  <th>State</th>
                  <th>Message</th>
                  <th>Who</th>
                  <th>When</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {list.map((row) => {
                  const { state, liveFor } = describeBanner(row, list, now);
                  return (
                    <tr key={row.id}>
                      <td data-th="State">
                        <span className={`bstate ${state}`}>{STATE_LABEL[state]}</span>
                        {state === "live" && (
                          <div className="hint" style={{ marginTop: 4 }}>
                            {liveFor.join(" · ")}
                          </div>
                        )}
                        {state === "waiting" && (
                          <div className="hint" style={{ marginTop: 4 }}>
                            another banner is showing
                          </div>
                        )}
                      </td>
                      <td data-th="Message">
                        <button className="linklike" onClick={() => setEditing(row)}>
                          {row.message}
                        </button>
                      </td>
                      <td data-th="Who">{AUDIENCE_LABEL[row.audience] ?? row.audience}</td>
                      <td data-th="When">{windowText(row)}</td>
                      <td data-th="">
                        <button className="btn" onClick={() => toggle(row)}>
                          {row.enabled ? "Switch off" : "Switch on"}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {editing !== null && (
        <BannerFormModal
          banner={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={onSaved}
          onDeleted={(id) => {
            setRows((cur) => cur?.filter((b) => b.id !== id) ?? cur);
            setEditing(null);
          }}
        />
      )}
    </>
  );
}
