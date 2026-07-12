/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export',
  // IMPORTANT: Replace 'nexus-ui' with your exact GitHub repository name
  basePath: '/nexus-ui', 
  images: {
    unoptimized: true,
  },
};

export default nextConfig;