/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: ["better-sqlite3", "pdf-parse", "pdfjs-dist"],
  devIndicators: false,
  allowedDevOrigins: ["127.0.0.1"],
  // The in-app kindle reader was removed; the book lives at ainative.business.
  // Redirect legacy /book links (and any chapter-anchored deep links) there.
  async redirects() {
    return [
      {
        source: "/book/:path*",
        destination: "https://ainative.business/book",
        permanent: true,
      },
      {
        source: "/book",
        destination: "https://ainative.business/book",
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
