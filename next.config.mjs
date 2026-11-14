/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    serverActions: {
      bodySizeLimit: "15mb",
    },
    staleTimes: {
      dynamic: 300,
      static: 600,
    },
  },
};

export default nextConfig;
