"use client";

import { useState } from "react";

const MAX_BYTES = 4 * 1024 * 1024;
const MAX_DIM = 4096;

export default function FloorplanUpload() {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function handle(file: File) {
    setBusy(true);
    setMsg(null);
    try {
      const bitmap = await createImageBitmap(file);
      let blob: Blob = file;
      let w = bitmap.width;
      let h = bitmap.height;

      // Downscale oversized files so they clear the 4 MB request limit
      if (file.size > MAX_BYTES || Math.max(w, h) > MAX_DIM * 2) {
        const scale = Math.min(1, MAX_DIM / Math.max(w, h));
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(w * scale);
        canvas.height = Math.round(h * scale);
        canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
        blob = await new Promise<Blob>((resolve) =>
          canvas.toBlob((b) => resolve(b!), "image/jpeg", 0.85)
        );
        w = canvas.width;
        h = canvas.height;
      }
      if (blob.size > MAX_BYTES) {
        setMsg({ ok: false, text: "Even after compression that image is over 4 MB — try a smaller export." });
        return;
      }

      const res = await fetch(`/api/admin/map/floorplan?w=${w}&h=${h}`, {
        method: "PUT",
        headers: { "Content-Type": blob.type || "image/png" },
        body: blob,
      });
      const data = await res.json();
      if (!res.ok) {
        setMsg({ ok: false, text: data.error ?? "Upload failed." });
        return;
      }
      setMsg({ ok: true, text: "Floor plan updated — reloading…" });
      setTimeout(() => window.location.reload(), 900);
    } catch {
      setMsg({ ok: false, text: "Couldn't read that image." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <h2 style={{ marginTop: 0, fontSize: 15 }}>Floor plan background</h2>
      <p className="hint" style={{ marginTop: 0 }}>
        PNG/JPEG/WebP. Replacing it keeps every shelf where it is (shelves live in floor-plan
        coordinates), so re-upload at the same proportions.
      </p>
      {msg && <div className={msg.ok ? "notice" : "error"}>{msg.text}</div>}
      <input
        type="file"
        accept="image/png,image/jpeg,image/webp"
        disabled={busy}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handle(f);
        }}
      />
    </div>
  );
}
