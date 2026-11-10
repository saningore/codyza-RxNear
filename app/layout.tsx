import type { Metadata } from "next";
import { Public_Sans, Source_Serif_4 } from "next/font/google";
import Link from "next/link";
import ServiceWorkerRegister from "@/components/ServiceWorkerRegister";
import "./globals.css";
import "maplibre-gl/dist/maplibre-gl.css";

const sans = Public_Sans({
  subsets: ["latin"],
  weight: ["400", "600", "700"],
  variable: "--font-public",
});

const serif = Source_Serif_4({
  subsets: ["latin"],
  weight: ["600", "700"],
  variable: "--font-source",
});

export const metadata: Metadata = {
  title: { default: "RxNear", template: "%s · RxNear" },
  description: "Find pharmacies near a U.S. location using the federal NPI registry. RxNear does not invent stock, prices, or hours.",
  manifest: "/manifest.webmanifest",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${sans.variable} ${serif.variable}`}>
      <body className="min-h-screen font-sans antialiased">
        <ServiceWorkerRegister />
        <a className="skip-link" href="#main">Skip to content</a>
        <div className="bg-clay px-4 py-2 text-center text-sm font-semibold text-white">
          If this is an emergency, call 911. RxNear does not provide medical advice or medication stock.
        </div>
        <header className="border-b border-line bg-card">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-4">
            <Link href="/" className="flex items-center gap-3">
              <span className="grid h-11 w-11 place-items-center rounded-2xl bg-pine text-card" aria-hidden="true">
                <svg viewBox="0 0 32 32" className="h-7 w-7">
                  <path fill="currentColor" d="M14 4h4v8h8v4h-8v8h-4v-8H6v-4h8V4z" />
                  <circle cx="24" cy="24" r="3" />
                </svg>
              </span>
              <span>
                <span className="block font-serif text-2xl font-semibold leading-none tracking-tight">RxNear</span>
                <span className="text-sm text-ink/70">Find nearby pharmacies</span>
              </span>
            </Link>
            <nav className="flex gap-1 text-sm font-semibold" aria-label="Primary">
              <Link className="rounded-full px-3 py-2 hover:bg-moss focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pine" href="/">Find pharmacies</Link>
              <Link className="rounded-full px-3 py-2 hover:bg-moss focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pine" href="/sources">Sources</Link>
              <Link className="rounded-full px-3 py-2 hover:bg-moss focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pine" href="/about">About</Link>
            </nav>
          </div>
        </header>
        <main id="main">{children}</main>
        <footer className="mt-16 border-t border-line px-4 py-8 text-center text-sm">
          <p className="font-bold">
            Powered by <a className="text-pine underline underline-offset-2" href="https://codyza.com" target="_blank" rel="noopener noreferrer">Codyza</a>
          </p>
          <p className="mt-2 text-ink/70">Public records only. RxNear does not show stock, prices, or insurance coverage.</p>
        </footer>
      </body>
    </html>
  );
}
