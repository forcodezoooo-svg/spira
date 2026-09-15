// 위계 번호표: 사업목표=사각형, 프로젝트=삼각형, 산출물=동그라미. 도형 안에 번호를 표시해 계층을 한눈에 구분.
export type LevelShape = 'square' | 'triangle' | 'circle';

export default function LevelBadge({ shape, n, color = '#5EA63A', size = 18 }: {
  shape: LevelShape;
  n: number;
  color?: string;
  size?: number;
}) {
  return (
    <span className="inline-flex items-center justify-center flex-shrink-0 relative" style={{ width: size, height: size }} aria-hidden>
      <svg width={size} height={size} viewBox="0 0 20 20" className="absolute inset-0">
        {shape === 'square' && <rect x="1.5" y="1.5" width="17" height="17" rx="3.5" fill={color} />}
        {shape === 'circle' && <circle cx="10" cy="10" r="8.5" fill={color} />}
        {shape === 'triangle' && <path d="M10 1.6 L18.4 17.6 L1.6 17.6 Z" fill={color} strokeLinejoin="round" />}
      </svg>
      <span className="relative font-bold text-white tabular-nums" style={{ fontSize: Math.round(size * 0.5), lineHeight: 1, marginTop: shape === 'triangle' ? size * 0.18 : 0 }}>{n}</span>
    </span>
  );
}
