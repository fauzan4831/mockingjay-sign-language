import type { Metadata } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";

// KONFIGURASI TIPE HURUF (FONT) SECARA GLOBAL
// Memuat font Plus Jakarta Sans dengan bobot huruf yang ditentukan untuk tampilan SaaS premium.
// Variabel CSS digunakan untuk kemudahan konfigurasi kustomisasi Tailwind CSS.
const plusJakartaSans = Plus_Jakarta_Sans({
  weight: ["300", "400", "500", "600", "700", "800"],
  variable: "--font-plus-jakarta-sans",
  subsets: ["latin"],
});

// METADATA GLOBAL APLIKASI (SEO)
// Menentukan judul tab peramban, deskripsi SEO, dan optimasi performa pencarian.
export const metadata: Metadata = {
  title: "Mockingjay Sign Language - Interpreter",
  description: "Real-time sign language interpreter (Alphabet, Numbers, Vocabulary) using hybrid Next.js + Flask backend and TensorFlow models.",
};

// KONTENER ROOT LAYOUT (TAMPILAN INDUK)
// Mengemas seluruh rute halaman web untuk memastikan konsistensi struktur DOM,
// pewarisan tipe font global, pewarnaan latar belakang halaman, dan warna seleksi teks.
export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="id" className={`${plusJakartaSans.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col bg-background text-foreground selection:bg-slate-900 selection:text-white">
        {children}
      </body>
    </html>
  );
}
