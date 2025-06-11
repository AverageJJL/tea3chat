import "./globals.css";

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className="bg-blue-100 antialiased">
        {children}
      </body>
    </html>
  );
}
