import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  outputFileTracingIncludes: {
    "/staff/admin/sign-maker/frame": ["./assets/sign-maker.html"],
  },
  // Staging bridge: when NEW2_TARGET is set (Vercel Production env), serve the
  // redesigned portal's branch deployment under /new2 on this domain. The
  // target build runs with basePath /new2, so the prefix is kept. Inert (no
  // rewrite at all) while NEW2_TARGET is unset. Remove at launch.
  async rewrites() {
    const target = process.env.NEW2_TARGET?.replace(/\/+$/, "");
    if (!target) return [];
    return [{ source: "/new2/:path*", destination: `${target}/new2/:path*` }];
  },
};

export default nextConfig;
