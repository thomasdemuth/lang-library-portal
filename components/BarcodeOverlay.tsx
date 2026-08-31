"use client";

import { useEffect, useRef, useState } from "react";
import { beep, startScanner, type ScannerHandle } from "@/lib/scan";
import { upcAToEan13 } from "@/lib/isbn";

/**
 * A minimal full-screen barcode scanner for circulation (a stripped-down
 * sibling of ScanPanel's overlay, same CSS): open the rear camera, read one
 * EAN-13/UPC-A, beep, hand the code up. The caller decides what a code
 * means and when to close. Repeat reads of the same code are swallowed for
 * a few seconds — books linger in frame.
 */
export default function BarcodeOverlay({
  onCode,
  onClose,
  hint,
}: {
  onCode: (ean13: string) => void;
  onClose: () => void;
  hint?: string;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const scanner = useRef<ScannerHandle | null>(null);
  const last = useRef<{ code: string; at: number } | null>(null);
  const [camError, setCamError] = useState<string | null>(null);
  const [flash, setFlash] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (!videoRef.current) return;
        const handle = await startScanner(videoRef.current, (raw) => {
          const code = raw.length === 12 ? upcAToEan13(raw) ?? raw : raw;
          const now = Date.now();
          if (last.current && last.current.code === code && now - last.current.at < 3000) return;
          last.current = { code, at: now };
          beep(true);
          setFlash(true);
          setTimeout(() => setFlash(false), 350);
          onCode(code);
        });
        if (cancelled) handle.stop();
        else scanner.current = handle;
      } catch {
        if (!cancelled) setCamError("Camera unavailable — allow camera access and try again.");
      }
    })();
    return () => {
      cancelled = true;
      scanner.current?.stop();
      scanner.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="scan-overlay" role="dialog" aria-label="Barcode scanner">
      <div className={`scan-stage${flash ? " flash" : ""}`}>
        <video ref={videoRef} className="scan-video" muted playsInline />
        <div className="scan-guide" aria-hidden />
        {camError && <div className="scan-camerror">{camError}</div>}
        <div className="scan-top">
          {hint ? <span className="scan-bulkhint" style={{ color: "#fff" }}>{hint}</span> : <span />}
          <button className="scan-close" onClick={onClose} aria-label="Close scanner">
            ✕
          </button>
        </div>
      </div>
    </div>
  );
}
