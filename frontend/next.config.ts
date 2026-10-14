import type { NextConfig } from "next";

// Where the FastAPI backend runs. Read when the app is built.
const API_ORIGIN = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000").replace(/\/$/, "");

const nextConfig: NextConfig = {
  // Lets React memoise components automatically, so the code does not need
  // hand-written useMemo/useCallback.
  reactCompiler: true,
  // The floating Next.js badge covers the mute button during development.
  devIndicators: false,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  // The browser calls the API at this site's own address (/api/...) and
  // Next.js forwards the request to the backend. To the browser it is one
  // site, so the sign-in cookie is an ordinary first-party cookie.
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${API_ORIGIN}/api/:path*` }];
  },
};

export default nextConfig;
