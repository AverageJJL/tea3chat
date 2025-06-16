import { ClerkProvider } from '@clerk/nextjs';
import './globals.css';

export default function RootLayout({ children }) {
  return (
    <ClerkProvider>
      <html lang="en">
        <body className="bg-gray-900 antialiased">
          {children}
        </body>
      </html>
    </ClerkProvider>
  );
}
