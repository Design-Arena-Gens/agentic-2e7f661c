import './globals.css';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'UGC Fashion Enhancer',
  description: 'Amélioration d’images et vidéo UGC mode',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" className="h-full bg-white">
      <body className="min-h-screen text-gray-900 antialiased">{children}</body>
    </html>
  );
}
