import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import SWRPersistedProvider from "../shared/swr/SWRPersistedProvider";
import { ThemeProvider } from "../components/ThemeProvider";
import AuthGuard from "../components/AuthGuard";
import ChatOnlyShell from "../mobile/layout/ChatOnlyShell";
import ServiceWorkerRegister from "../shared/sw/ServiceWorkerRegister";
import "./globals.css";

/**
 * Fuentes locales, no `next/font/google`: con Google, `next build` descarga las fuentes en medio
 * del build y, si esa descarga se corta (build server cargado, red), aborta el deploy entero
 * ("Failed to fetch `Plus Jakarta Sans` from Google Fonts"). Son los mismos archivos que Google
 * entregaba (subset latino, fuentes variables: un archivo cubre todos los pesos). Licencia OFL.
 */
const plusJakarta = localFont({
  src: "./fonts/plus-jakarta-sans-latin.woff2",
  variable: "--font-plus-jakarta",
  weight: "300 800",
  display: "swap",
});

const geistMono = localFont({
  src: "./fonts/geist-mono-latin.woff2",
  variable: "--font-geist-mono",
  weight: "100 900",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Zentra Chat",
  description: "Inbox de conversaciones Zentra.",
  manifest: "/manifest.json",
  applicationName: "Zentra Chat",
  appleWebApp: {
    capable: true,
    title: "Zentra Chat",
    statusBarStyle: "black-translucent",
  },
  icons: {
    icon: [{ url: "/icon.png", sizes: "512x512", type: "image/png" }],
    apple: [{ url: "/icon.png", sizes: "512x512", type: "image/png" }],
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