/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    useTypeScriptCli: true,
  },
  transpilePackages: ["@workspace/ui"],
}

export default nextConfig
