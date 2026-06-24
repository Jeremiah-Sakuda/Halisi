/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // The credential-fingerprint hashing and token verification use Node's crypto,
  // so the API routes run on the Node.js runtime (not Edge).
  serverExternalPackages: ["@aws-sdk/client-dynamodb", "@aws-sdk/lib-dynamodb"],
};

export default nextConfig;
