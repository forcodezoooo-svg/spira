import type { MetadataRoute } from 'next';
import { siteUrl } from './lib/siteUrl';

// 검색 크롤러 규칙 — 공개 페이지는 허용, 로그인 필요한 앱 내부/데이터 경로는 제외
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/home', '/plan', '/programs', '/resources', '/journey', '/pricing', '/api/'],
    },
    sitemap: `${siteUrl}/sitemap.xml`,
  };
}
