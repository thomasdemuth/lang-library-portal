import type { MetadataRoute } from "next";
import { withBase } from "@/lib/base";

/**
 * Web-app manifest: lets the portal be pinned to a phone's home screen as
 * a standalone "app" (no browser chrome). Served at /manifest.webmanifest
 * on both hosts; the middleware leaves it public.
 *
 * Next prefixes the manifest ROUTE with basePath, but not the URLs inside the
 * JSON it returns — start_url, scope, id and every icon src are ours to
 * prefix (withBase is the identity when no base path is configured).
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: withBase("/"),
    name: "Lang Library",
    short_name: "Library",
    description: "The Lang School library portal",
    start_url: withBase("/"),
    scope: withBase("/"),
    display: "standalone",
    background_color: "#f2f4f8",
    theme_color: "#2e50c8",
    icons: [
      { src: withBase("/icon-192.png"), sizes: "192x192", type: "image/png" },
      { src: withBase("/icon-512.png"), sizes: "512x512", type: "image/png" },
      { src: withBase("/icon-512.png"), sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
