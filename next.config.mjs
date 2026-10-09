import { fileURLToPath } from "node:url";

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  outputFileTracingRoot: fileURLToPath(new URL(".", import.meta.url)),
  // The calculation engine (lib/calculations) is the ONLY place business
  // arithmetic runs. It is imported by server actions and server components
  // only; nothing here moves a formula into the browser bundle.
  serverExternalPackages: [],
};

export default nextConfig;
