import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "OrderDesk",
  description: "Order management",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-background font-sans text-foreground antialiased">
        <nav className="flex items-center gap-5 border-b px-5 py-3">
          <strong className="text-sm font-semibold">OrderDesk</strong>
          <Link href="/" className="text-sm text-muted-foreground hover:text-foreground">
            Orders
          </Link>
          <Link
            href="/dashboard"
            className="text-sm text-muted-foreground hover:text-foreground"
          >
            Dashboard
          </Link>
          <Link
            href="/import"
            className="text-sm text-muted-foreground hover:text-foreground"
          >
            Import
          </Link>
        </nav>
        <main className="p-5">{children}</main>
      </body>
    </html>
  );
}
