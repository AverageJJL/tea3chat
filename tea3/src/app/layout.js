import { ClerkProvider } from '@clerk/nextjs';
import './globals.css';

export default function RootLayout({ children }) {
  return (
    <ClerkProvider>
      <html lang="en">
        <head>
          <link rel="preconnect" href="https://fonts.googleapis.com" />
          <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="true" />
          <link href="https://fonts.googleapis.com/css2?family=Oswald:wght@200..700&display=swap" rel="stylesheet" />
        </head>
        <body className="bg-gray-900 antialiased">
          {children}
        </body>
      </html>
    </ClerkProvider>
  );
}
