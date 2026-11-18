import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://qualify.guardian1st.io"),
  title: "Guardian 1st | Free Home Protection Audit",
  description:
    "Find out whether home security, personal safety, or both are right for your home. Start with a free, no-obligation home audit from Guardian 1st.",
  alternates: { canonical: "https://qualify.guardian1st.io" },
  openGraph: {
    title: "Guardian 1st | Free Home Protection Audit",
    description:
      "Answer a few quick questions and get a free, no-obligation home protection recommendation from Guardian 1st.",
    url: "https://qualify.guardian1st.io",
    siteName: "Guardian 1st",
    type: "website",
    locale: "en_GB",
    images: [{ url: "/logo.png", width: 1017, height: 290, alt: "Guardian 1st" }],
  },
};

const jsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      "@id": "https://qualify.guardian1st.io/#organization",
      name: "Guardian 1st",
      parentOrganization: "Home 1st Group Ltd",
      url: "https://guardian1st.io",
      logo: { "@type": "ImageObject", url: "https://qualify.guardian1st.io/logo.png" },
    },
    {
      "@type": "WebPage",
      "@id": "https://qualify.guardian1st.io/#webpage",
      url: "https://qualify.guardian1st.io",
      name: "Free Home Protection Audit",
      description:
        "A short qualification quiz that recommends home security and personal safety protection, followed by a free, no-obligation home audit.",
      publisher: { "@id": "https://qualify.guardian1st.io/#organization" },
    },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <head>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      </head>
      <body className="min-h-full flex flex-col bg-white text-gray-900">{children}</body>
    </html>
  );
}
