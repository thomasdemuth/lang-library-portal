import type { Metadata, Viewport } from "next";
import { Lexend } from "next/font/google";
import UpdatePrompt from "@/components/UpdatePrompt";
import Announcer from "@/components/Announcer";
import "./globals.css";

// Self-hosted via next/font: no render-blocking Google Fonts request, no
// layout-shift flash. Exposed as a CSS variable so globals.css owns the stack.
const lexend = Lexend({
  subsets: ["latin"],
  weight: ["400", "600", "700"],
  display: "swap",
  variable: "--font-lexend",
});

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
    <html lang="en" suppressHydrationWarning className={lexend.variable}>
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
              'if(localStorage.getItem("ll-sidenav")==="collapsed")document.documentElement.dataset.sidenav="collapsed";',
              "}catch(e){}",
            ].join(""),
          }}
        />
      </head>
      <body>
        {children}
        {/* Shared screen-reader live regions — every surface announces through this */}
        <Announcer />
        <UpdatePrompt />
      </body>
    </html>
  );
}
