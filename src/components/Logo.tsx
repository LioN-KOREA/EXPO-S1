'use client';

interface LogoProps {
  size?: number;
  showText?: boolean;
  textSize?: string;
}

export function Logo({ size = 34, showText = true, textSize = '17px' }: LogoProps) {
  const ringWidth = size > 30 ? 2.5 : size > 20 ? 2 : 1.5;
  const innerInset = Math.round(size * 0.15);
  const innerRingWidth = size > 30 ? 2 : size > 20 ? 1.5 : 1;
  const dotSize = Math.max(Math.round(size * 0.2), 4);

  return (
    <div className="flex items-center gap-2.5">
      <div className="relative shrink-0" style={{ width: size, height: size }}>
        {/* Outer ring */}
        <div
          className="absolute inset-0 rounded-full"
          style={{
            border: `${ringWidth}px solid transparent`,
            borderTopColor: '#60a5fa',
            borderRightColor: '#818cf8',
          }}
        />
        {/* Inner ring */}
        <div
          className="absolute rounded-full"
          style={{
            inset: innerInset,
            border: `${innerRingWidth}px solid transparent`,
            borderBottomColor: '#c084fc',
            borderLeftColor: '#22d3ee',
          }}
        />
        {/* Center dot */}
        <div
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full"
          style={{
            width: dotSize,
            height: dotSize,
            background: 'linear-gradient(135deg, #60a5fa, #c084fc)',
            boxShadow: '0 0 10px rgba(96,165,250,0.5)',
          }}
        />
      </div>
      {showText && (
        <span
          className="font-bold tracking-wider"
          style={{
            fontFamily: "'Space Grotesk', sans-serif",
            fontSize: textSize,
            background: 'linear-gradient(135deg, #e2e8f0, #94a3b8)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
          }}
        >
          contEXT
        </span>
      )}
    </div>
  );
}
