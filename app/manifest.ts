import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Guardian 1st",
    short_name: "Guardian1st",
    description:
      "Free home protection assessment. Home security and personal safety, recommended around your home.",
    start_url: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#2e7a45",
    icons: [
      { src: "/logo.png", sizes: "any", type: "image/png", purpose: "any" },
    ],
  };
}
