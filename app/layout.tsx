import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import Nav from "@/components/Nav";
import MatchAlertsProvider from "@/components/match/MatchAlerts";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Findr — Campus Lost & Found",
  description:
    "Report a lost or found item on campus and let Findr's AI search for the match — on a live map of SRM Kattankulathur.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${inter.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col bg-bg text-fg">
        <MatchAlertsProvider>
          <Nav />
          <main className="flex-1 flex flex-col min-h-0">{children}</main>
        </MatchAlertsProvider>
      </body>
    </html>
  );
}
