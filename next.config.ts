import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */

  devIndicators: false,
  // pdf-parse(+pdfjs)는 Node 네이티브 동작이라 번들에서 제외하고 런타임에 require
  serverExternalPackages: ['pdf-parse'],
};

export default nextConfig;
