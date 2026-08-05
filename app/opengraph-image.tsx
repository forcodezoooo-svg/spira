import { ImageResponse } from 'next/og';

// 링크 공유 시 뜨는 미리보기 카드 이미지 (1200×630). 빌드 시 생성.
export const alt = 'Spira — 1인 창업가를 위한 사업 운영 OS';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default async function Image() {
  // 한글 렌더용 폰트(Pretendard). 실패해도 이미지는 생성되도록 안전 처리.
  let font: ArrayBuffer | undefined;
  try {
    const res = await fetch(
      'https://cdn.jsdelivr.net/gh/orioncactus/pretendard/packages/pretendard/dist/public/static/Pretendard-Bold.otf',
    );
    if (res.ok) font = await res.arrayBuffer();
  } catch { /* 폰트 없이 생성 */ }

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          padding: '90px',
          backgroundColor: '#16211E',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 34 }}>
          <div style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: '#9DFE3B', marginRight: 16 }} />
          <div style={{ fontSize: 32, color: '#9DFE3B', fontWeight: 700 }}>Spira</div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ fontSize: 86, color: '#F8F8F8', fontWeight: 700, lineHeight: 1.15 }}>흩어진 사업 운영을,</div>
          <div style={{ fontSize: 86, color: '#9DFE3B', fontWeight: 700, lineHeight: 1.15 }}>한곳에서.</div>
        </div>
        <div style={{ fontSize: 36, color: '#AEB8AE', marginTop: 30, fontWeight: 700 }}>
          1인 창업가를 위한 사업 운영 OS
        </div>
      </div>
    ),
    {
      width: size.width,
      height: size.height,
      fonts: font ? [{ name: 'Pretendard', data: font, weight: 700, style: 'normal' }] : undefined,
    },
  );
}
