import "./globals.css";
import type { Metadata } from "next";

import SessionProviderWrapper from "@/components/SessionProviderWrapper";
import ThemeToggle from "@/components/ThemeToggle";

export const metadata: Metadata = {
  title: "Aditi Stays",
  description: "Story-driven halal-compliant catalog + CRM",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen font-sans antialiased">
        <SessionProviderWrapper>
          <div className="fixed right-4 top-4 z-[180]">
            <ThemeToggle />
          </div>
          {children}
        </SessionProviderWrapper>
      </body>
    </html>
  );
}
