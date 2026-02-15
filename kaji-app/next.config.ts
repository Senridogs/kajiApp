import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Workaround for a Next.js devtools draggable indicator bug that can throw
  // `releasePointerCapture` NotFoundError in development.
  devIndicators: false,
};

export default nextConfig;
