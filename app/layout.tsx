import type { Metadata } from "next";
import Script from "next/script";
import "./globals.css";

const PIXEL_ID = process.env.GHL_EVENT_1_PIXELID;

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
        {PIXEL_ID && (
          <Script id="meta-pixel" strategy="afterInteractive">
            {`
              !function(f,b,e,v,n,t,s)
              {if(f.fbq)return;n=f.fbq=function(){n.callMethod?
              n.callMethod.apply(n,arguments):n.queue.push(arguments)};
              if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
              n.queue=[];t=b.createElement(e);t.async=!0;
              t.src=v;s=b.getElementsByTagName(e)[0];
              s.parentNode.insertBefore(t,s)}(window,document,'script',
              'https://connect.facebook.net/en_US/fbevents.js');
              fbq('init', '${PIXEL_ID}');
              fbq('track', 'PageView');
            `}
          </Script>
        )}
      </head>
      <body className="min-h-full flex flex-col bg-white text-gray-900">{children}</body>
    </html>
  );
}
