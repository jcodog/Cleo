/** @type {import('next').NextConfig} */
const nextConfig = {
  // TypeScript 7 has no JavaScript compiler API. Next 16.3 preview's CLI path
  // keeps Next's production typecheck on the workspace's official TS 7 binary.
  experimental: {
    useTypeScriptCli: true,
  },
  transpilePackages: ["@workspace/ui"],
}

export default nextConfig
