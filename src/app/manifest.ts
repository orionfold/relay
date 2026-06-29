import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Orionfold Relay",
    short_name: "Relay",
    description: "Multi-agent orchestration for AI-native work",
    start_url: "/",
    display: "standalone",
    // Brand: dark slate base + Tide cyan (= --primary). Replaces pre-brand
    // indigo/slate left over from before the Orionfold rebrand.
    background_color: "#040a11",
    theme_color: "#009b97",
    icons: [
      {
        src: "/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon-512-maskable.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
