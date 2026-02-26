import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Sidebar } from "@/components/layout/sidebar";
import { LanguageProvider } from "@/i18n/language-context";
import { UserProvider } from "@/contexts/user-context";
import { LoginGuard } from "@/components/layout/login-guard";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Bonsai",
  description: "AI-powered developer workspace",
  icons: {
    icon: [
      { url: "/bonsai-os-logo-l.png", media: "(prefers-color-scheme: dark)" },
      { url: "/bonsai-os-logo-d.png", media: "(prefers-color-scheme: light)" },
    ],
    apple: "/bonsai-os-logo-d.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <LanguageProvider>
          <UserProvider>
            <LoginGuard>
              <div className="flex h-screen overflow-hidden">
                <Sidebar />
                <main className="flex-1 overflow-hidden">{children}</main>
              </div>
            </LoginGuard>
          </UserProvider>
        </LanguageProvider>
      </body>
    </html>
  );
}
