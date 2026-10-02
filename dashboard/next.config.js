/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: {
    domains: [
      'res.cloudinary.com',
      'images.unsplash.com',
      'placehold.co',
      'graph.facebook.com',
    ],
  },
};

module.exports = nextConfig;
