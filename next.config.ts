import type { NextConfig } from 'next';

// Routes that read the bundled PDF font at runtime (PDF creation and glyph validation).
const font = ['./public/fonts/NotoSans-Regular.ttf', './public/fonts/NotoSans-SemiBold.ttf'];

const config: NextConfig = {
  poweredByHeader: false,
  outputFileTracingIncludes: {
    '/api/admin/submissions/*': font,
    '/api/admin/submissions/*/pdf': font,
    '/api/admin/submissions/*/certificate': font,
    '/api/admin/certificate-preview': font,
    '/api/admin/pdf-preview': font,
    '/api/admin/settings': font,
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'no-referrer' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
          {
            key: 'Content-Security-Policy',
            value: "frame-ancestors 'none'; object-src 'none'; base-uri 'self'; form-action 'self'",
          },
        ],
      },
      { source: '/admin/:path*', headers: [{ key: 'Cache-Control', value: 'private, no-store' }] },
    ];
  },
};

export default config;
