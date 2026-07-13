/**
 * Camera barcode scanning with two engines:
 *  - native BarcodeDetector (Chrome/Android — fast, hardware-assisted)
 *  - @zxing/library fallback (iOS Safari has no BarcodeDetector)
 * Both scan for EAN-13/UPC-A — the Bookland barcodes printed on books.
 */
import {
  BarcodeFormat,
  BinaryBitmap,
  DecodeHintType,
  HybridBinarizer,
  MultiFormatReader,
  NotFoundException,
  RGBLuminanceSource,
} from "@zxing/library";

type NativeDetector = {
  detect: (source: CanvasImageSource) => Promise<{ rawValue: string }[]>;
};

declare global {
  interface Window {
    BarcodeDetector?: new (opts?: { formats: string[] }) => NativeDetector;
  }
}

export type ScannerHandle = { stop: () => void };

async function nativeDetector(): Promise<NativeDetector | null> {
  try {
    const BD = window.BarcodeDetector;
    if (!BD) return null;
    // Some builds expose the constructor without EAN support
    const supported: string[] = await (BD as unknown as {
      getSupportedFormats?: () => Promise<string[]>;
    }).getSupportedFormats?.() ?? [];
    if (supported.length && !supported.includes("ean_13")) return null;
    return new BD({ formats: ["ean_13", "upc_a"] });
  } catch {
    return null;
  }
}

function zxingReader(): MultiFormatReader {
  const reader = new MultiFormatReader();
  const hints = new Map();
  hints.set(DecodeHintType.POSSIBLE_FORMATS, [BarcodeFormat.EAN_13, BarcodeFormat.UPC_A]);
  hints.set(DecodeHintType.TRY_HARDER, true);
  reader.setHints(hints);
  return reader;
}

/**
 * Open the rear camera into `video` and call `onCode` for every barcode
 * read. Repeat reads are the caller's problem (books linger in frame).
 * Throws if the camera can't be opened (denied / unavailable).
 */
export async function startScanner(
  video: HTMLVideoElement,
  onCode: (code: string) => void
): Promise<ScannerHandle> {
  const stream = await navigator.mediaDevices.getUserMedia({
    video: {
      facingMode: { ideal: "environment" },
      width: { ideal: 1280 },
      height: { ideal: 720 },
    },
    audio: false,
  });
  video.srcObject = stream;
  video.setAttribute("playsinline", "true"); // iOS: stay inline, not fullscreen
  await video.play();

  let stopped = false;
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  const native = await nativeDetector();
  const zxing = native ? null : zxingReader();

  async function tick() {
    if (stopped) return;
    if (video.readyState >= 2 && video.videoWidth > 0) {
      try {
        if (native) {
          const codes = await native.detect(video);
          for (const c of codes) if (c.rawValue) onCode(c.rawValue);
        } else if (zxing) {
          // Decode a horizontal band around the center — where the guide
          // frame tells the user to hold the barcode. Much faster than
          // full frames and rejects clutter at the edges.
          const bandH = Math.round(video.videoHeight * 0.45);
          canvas.width = video.videoWidth;
          canvas.height = bandH;
          ctx.drawImage(
            video,
            0, Math.round((video.videoHeight - bandH) / 2), video.videoWidth, bandH,
            0, 0, canvas.width, canvas.height
          );
          const { data, width, height } = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const gray = new Uint8ClampedArray(width * height);
          for (let i = 0, j = 0; i < gray.length; i++, j += 4) {
            gray[i] = (data[j] * 306 + data[j + 1] * 601 + data[j + 2] * 117) >> 10;
          }
          const bitmap = new BinaryBitmap(new HybridBinarizer(new RGBLuminanceSource(gray, width, height)));
          const result = zxing.decode(bitmap);
          if (result?.getText()) onCode(result.getText());
        }
      } catch (e) {
        if (!(e instanceof NotFoundException)) {
          // decoding hiccup on a frame — keep scanning
        }
      }
    }
    if (!stopped) setTimeout(tick, native ? 120 : 180);
  }
  tick();

  return {
    stop() {
      stopped = true;
      stream.getTracks().forEach((t) => t.stop());
      video.srcObject = null;
    },
  };
}

/** Short confirmation blip (iOS has no vibration API — sound + flash instead). */
export function beep(ok = true) {
  try {
    type AudioCtor = typeof AudioContext;
    const Ctx: AudioCtor =
      window.AudioContext ?? (window as unknown as { webkitAudioContext: AudioCtor }).webkitAudioContext;
    const ctx = new Ctx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = ok ? 1245 : 220;
    gain.gain.setValueAtTime(0.12, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.18);
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.2);
    osc.onended = () => ctx.close();
  } catch {
    /* no audio — the visual flash still confirms */
  }
  navigator.vibrate?.(ok ? 40 : [60, 40, 60]);
}
