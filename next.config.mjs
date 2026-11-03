/** @type {import('next').NextConfig} */
const nextConfig = {
  async rewrites() {
    return [
      {
        source: "/api/ips/:path*",
        destination: "http://172.105.51.188:3005/api/:path*",
      },
    ];
  },
};
export default nextConfig;
