import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "CAF Review Console",
  description: "Human validation console for CAF content",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="min-h-screen font-sans antialiased">
        {children}
      </body>
    </html>
  );
}
