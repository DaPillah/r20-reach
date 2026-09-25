import type { MetadataRoute } from "next";

// Installable PWA: "Add to Home Screen" → app icon + full-screen standalone
// (no browser chrome). Next serves this at /manifest.webmanifest and links it
// automatically — so it's PUBLIC. Branded R20, never the internal "Oikos" name
// (a cold contact could save an invite page to their home screen).
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "R20",
    short_name: "R20",
    description: "For college students around NYC.",
    start_url: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#15110d",
    theme_color: "#15110d",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml" }],
  };
}
