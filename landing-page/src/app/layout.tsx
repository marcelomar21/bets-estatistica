import type { Metadata } from "next";
import { Geist } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Guru da Bet — Tips de apostas esportivas com Estatistica",
  description:
    "Analise estatistica avancada para maximizar seus resultados em apostas esportivas. Modelos matematicos com 71,32% de taxa de acerto.",
  keywords: [
    "apostas esportivas",
    "tips",
    "analise estatistica",
    "modelos matematicos",
    "guru da bet",
  ],
  openGraph: {
    title: "Guru da Bet — Tips de apostas esportivas com Estatistica",
    description:
      "Analise estatistica avancada e modelos matematicos para maximizar seus resultados. 71,32% de taxa de acerto.",
    url: "https://gurudabet.com.br",
    siteName: "Guru da Bet",
    locale: "pt_BR",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Guru da Bet — Tips de apostas esportivas com Estatistica",
    description:
      "Analise estatistica avancada e modelos matematicos para maximizar seus resultados. 71,32% de taxa de acerto.",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR">
      <body className={`${geistSans.variable} font-[family-name:var(--font-geist-sans)] antialiased`}>
        {children}
      </body>
    </html>
  );
}
