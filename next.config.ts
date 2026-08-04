import type { NextConfig } from "next";

// Subpath deployment: APP_BASE_PATH (server/build) and NEXT_PUBLIC_BASE_PATH
// (inlined into the browser bundle) are two halves of one switch and must
// agree. Half-set is the dangerous state — assets move but every raw href and
// fetch stays at the root, or vice versa — so fail the build loudly instead.
const serverBasePath = process.env.APP_BASE_PATH ?? "";
const clientBasePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
if (serverBasePath !== clientBasePath) {
  throw new Error(
    `APP_BASE_PATH ("${serverBasePath}") and NEXT_PUBLIC_BASE_PATH ("${clientBasePath}") must be set to the same value (or both left unset).`
  );
}

const nextConfig: NextConfig = {
  // Subpath deployments (staging at library.thelangschool.org/new2). Unset in
  // production: `undefined` is dropped when Next merges this config, so the
  // built app is byte-for-byte a root deployment. See lib/base.ts.
  basePath: process.env.APP_BASE_PATH || undefined,
  poweredByHeader: false,
  outputFileTracingIncludes: {
    "/staff/admin/sign-maker/frame": ["./assets/sign-maker.html"],
  },
};

export default nextConfig;
