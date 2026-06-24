import type { Metadata, Viewport } from "next";
import { Plus_Jakarta_Sans, Geist_Mono } from "next/font/google";
import SWRPersistedProvider from "../shared/swr/SWRPersistedProvider";
import { ThemeProvider } from "../components/ThemeProvider";
import AuthGuard from "../components/AuthGuard";
import ChatOnlyShell from "../mobile/layout/ChatOnlyShell";
import ServiceWorkerRegister from "../shared/sw/ServiceWorkerRegister";
import "./globals.css";

const plusJakarta = Plus_Jakarta_Sans({
  variable: "--font-plus-jakarta",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700", "800"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Neura Chats",
  description: "Inbox de conversaciones Neura.",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    title: "Neura Chats",
    statusBarStyle: "black-translucent",
  },
};

// Next 16 movió `themeColor` (y los demás viewport opts) fuera de `metadata`.
export const viewport: Viewport = {
  themeColor: "#0B3A3D",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" suppressHydrationWarning>
      <body className={`${plusJakarta.variable} ${geistMono.variable} antialiased`}>
        <ThemeProvider>
          <SWRPersistedProvider>
            <AuthGuard>
              <ChatOnlyShell>{children}</ChatOnlyShell>
            </AuthGuard>
            <ServiceWorkerRegister />
          </SWRPersistedProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}