import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "CAF Backend",
  description: "Content Automation Framework — Renderer, Template Playground, Review Console",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="min-h-screen font-sans antialiased">
        <nav className="sticky top-0 z-20 border-b bg-card px-4 py-3">
          <div className="mx-auto flex max-w-6xl items-center gap-6">
            <Link href="/" className="font-semibold text-card-foreground hover:underline">
              CAF Backend
            </Link>
            <Link href="/" className="text-sm text-muted-foreground hover:text-foreground">
              Review Console
            </Link>
            <Link href="/playground" className="text-sm text-muted-foreground hover:text-foreground">
              Template Playground
            </Link>
            <Link href="/settings/renderer" className="text-sm text-muted-foreground hover:text-foreground">
              Renderer Settings
            </Link>
          </div>
        </nav>
        {children}
      </body>
    </html>
  );
}
