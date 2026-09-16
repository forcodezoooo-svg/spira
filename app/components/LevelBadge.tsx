// 위계 번호표: 사업목표=사각형, 프로젝트=삼각형, 산출물=동그라미. 도형 안에 번호를 표시해 계층을 한눈에 구분.
export type LevelShape = 'square' | 'triangle' | 'circle';

export default function LevelBadge({ shape, n, color = '#5EA63A', size = 20 }: {
  shape: LevelShape;
  n: number;
  color?: string;
  size?: number;
}) {
  // 숫자는 SVG <text> + dominant-baseline로 정확히 중앙에 배치(HTML 텍스트의 line-height 쏠림 방지).
  // 삼각형은 무게중심이 아래쪽이라 y를 살짝 내려 시각적 중앙을 맞춘다.
  const cy = shape === 'triangle' ? 12.6 : 10;
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" className="inline-block flex-shrink-0 align-middle" aria-hidden>
      {shape === 'square' && <rect x="1.2" y="1.2" width="17.6" height="17.6" rx="4.5" fill={color} />}
      {shape === 'circle' && <circle cx="10" cy="10" r="9" fill={color} />}
      {shape === 'triangle' && <path d="M10 3.4 L16.6 16 L3.4 16 Z" fill={color} stroke={color} strokeWidth="3" strokeLinejoin="round" />}
      <text x="10" y={cy} textAnchor="middle" dominantBaseline="central" fill="#fff" fontSize="10.5" fontWeight="800" style={{ fontVariantNumeric: 'tabular-nums' }}>{n}</text>
    </svg>
  );
}
