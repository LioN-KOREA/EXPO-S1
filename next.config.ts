import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ['exceljs'],
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          // QR 출석용 카메라 권한 — CloudFront / 기타 프록시의 기본 차단 헤더 덮어쓰기
          // self = 동일 출처 카메라 사용 허용. 다른 권한은 명시적 차단.
          {
            key: 'Permissions-Policy',
            value: 'camera=(self), microphone=(), geolocation=()',
          },
        ],
      },
    ];
  },
};

export default nextConfig;
