/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["@ai-radar/db", "@ai-radar/shared"],
  serverExternalPackages: ["postgres"],
};

export default nextConfig;
