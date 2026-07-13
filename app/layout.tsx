import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Lang Library",
  description: "The Lang School library portal",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [{ url: "/icon-192.png", sizes: "192x192", type: "image/png" }],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
  appleWebApp: {
    capable: true,
    // Content extends under the iOS status bar; the app-bar gradient
    // paints that area itself (one continuous surface, no seam).
    statusBarStyle: "black-translucent",
    title: "Lang Library",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover", // extend under the iPhone notch; safe-area CSS handles it
  themeColor: "#2e50c8",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // The pre-paint script may stamp data-theme/data-textsize on <html>
    // before hydration — that attribute delta is expected, not a bug.
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Next's appleWebApp emits the modern tag; older iOS wants this one */}
        <meta name="apple-mobile-web-app-capable" content="yes" />
        {/* Apply saved appearance before first paint (no flash) */}
        <script
          dangerouslySetInnerHTML={{
            __html: [
              "try{",
              'var t=localStorage.getItem("ll-theme")||"light";',
              'var dark=t==="dark"||(t==="system"&&matchMedia("(prefers-color-scheme: dark)").matches);',
              'if(dark)document.documentElement.dataset.theme="dark";',
              'var s=localStorage.getItem("ll-textsize");',
              'if(s&&s!=="medium")document.documentElement.dataset.textsize=s;',
              "}catch(e){}",
            ].join(""),
          }}
        />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Montserrat:wght@500;600;700;800&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
