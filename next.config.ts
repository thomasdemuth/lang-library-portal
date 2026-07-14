import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  outputFileTracingIncludes: {
    "/staff/admin/sign-maker/frame": ["./assets/sign-maker.html"],
  },
};

export default nextConfig;
