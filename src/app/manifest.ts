import type { MetadataRoute } from "next";

// The colours are the board's `--ground` and `--panel` (see docs/design-language.md). The icon keeps its
// artwork inside the central 80%, so the one 512 pixel file serves as both a plain and a maskable icon.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Road Trip",
    short_name: "Road Trip",
    description: "What is on along the road, for the times you will be passing through.",
    lang: "en-CA",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#E7E8E4",
    theme_color: "#22302A",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
