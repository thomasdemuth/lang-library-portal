import type { MetadataRoute } from "next";

/**
 * Web-app manifest: lets the portal be pinned to a phone's home screen as
 * a standalone "app" (no browser chrome). Served at /manifest.webmanifest
 * on both hosts; the middleware leaves it public.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Lang Library",
    short_name: "Library",
    description: "The Lang School library portal",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#f2f4f8",
    theme_color: "#2e50c8",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
