import "./globals.css";
import type { Metadata } from "next";

import ThemeToggle from "@/components/ThemeToggle";

export const metadata: Metadata = {
  title: "Aditi Stays",
  description: "Story-driven halal-compliant catalog + CRM",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen font-sans antialiased">
        <div className="fixed right-4 top-4 z-[180]">
          <ThemeToggle />
        </div>
        {children}
      </body>
    </html>
  );
}
