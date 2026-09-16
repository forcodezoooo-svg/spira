// 위계 번호표: 사업목표=사각형, 프로젝트=삼각형, 산출물=동그라미. 도형 안에 번호를 표시해 계층을 한눈에 구분.
export type LevelShape = 'square' | 'triangle' | 'circle';

export default function LevelBadge({ shape, n, color = '#5EA63A', size = 20 }: {
  shape: LevelShape;
  n: number;
  color?: string;
  size?: number;
}) {
  return (
    <span className="inline-flex items-center justify-center flex-shrink-0 relative" style={{ width: size, height: size }} aria-hidden>
      <svg width={size} height={size} viewBox="0 0 20 20" className="absolute inset-0">
        {shape === 'square' && <rect x="1.2" y="1.2" width="17.6" height="17.6" rx="4.5" fill={color} />}
        {shape === 'circle' && <circle cx="10" cy="10" r="9" fill={color} />}
        {/* 삼각형: 같은 색 stroke + 둥근 joins 으로 모서리를 라운드 처리 */}
        {shape === 'triangle' && <path d="M10 3.4 L16.6 16 L3.4 16 Z" fill={color} stroke={color} strokeWidth="3" strokeLinejoin="round" />}
      </svg>
      <span className="relative text-white tabular-nums" style={{ fontSize: Math.round(size * 0.55), fontWeight: 800, lineHeight: 1, marginTop: shape === 'triangle' ? size * 0.16 : 0 }}>{n}</span>
    </span>
  );
}
