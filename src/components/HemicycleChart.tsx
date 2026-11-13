import React, { useState } from 'react';

export interface HemicycleItem {
  id: string;
  acronym: string;
  color: string;
  seats: number;
  pctOfValid: number;
}

interface HemicycleChartProps {
  items: HemicycleItem[];
  totalSeats: number;
}

interface SeatDot {
  x: number;
  y: number;
  id: string;
  acronym: string;
  color: string;
  seatIndex: number;
}

export const HemicycleChart: React.FC<HemicycleChartProps> = ({ items, totalSeats }) => {
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  const seatsList: Array<{ id: string; acronym: string; color: string }> = [];
  for (const item of items) {
    for (let i = 0; i < item.seats; i++) {
      seatsList.push({
        id: item.id,
        acronym: item.acronym,
        color: item.color,
      });
    }
  }

  while (seatsList.length < totalSeats) {
    seatsList.push({
      id: 'unassigned',
      acronym: 'Sin asignar',
      color: '#CBD5E1',
    });
  }

  const cx = 180;
  const cy = 165;
  const rows = totalSeats <= 5 ? 1 : totalSeats <= 12 ? 2 : totalSeats <= 24 ? 3 : 4;
  const innerR = rows === 1 ? 115 : 74;
  const outerR = 142;
  const rowStep = rows > 1 ? (outerR - innerR) / (rows - 1) : 0;

  const radii = Array.from({ length: rows }, (_, i) => innerR + i * rowStep);
  const totalRadius = radii.reduce((a, b) => a + b, 0);
  const rowCounts = radii.map((r) => Math.max(1, Math.round((r / totalRadius) * totalSeats)));
  let diff = totalSeats - rowCounts.reduce((a, b) => a + b, 0);
  let idxAdjust = rows - 1;
  while (diff !== 0) {
    if (diff > 0) {
      rowCounts[idxAdjust]++;
      diff--;
    } else if (rowCounts[idxAdjust] > 1) {
      rowCounts[idxAdjust]--;
      diff++;
    }
    idxAdjust = (idxAdjust - 1 + rows) % rows;
  }

  const rawPositions: Array<{ x: number; y: number; angle: number; r: number }> = [];
  rowCounts.forEach((count, rowIdx) => {
    const r = radii[rowIdx];
    for (let i = 0; i < count; i++) {
      const t = count === 1 ? 0.5 : i / (count - 1);
      const angle = Math.PI - t * Math.PI;
      rawPositions.push({
        x: cx + r * Math.cos(angle),
        y: cy - r * Math.sin(angle),
        angle,
        r,
      });
    }
  });

  rawPositions.sort((a, b) => {
    if (Math.abs(b.angle - a.angle) > 0.04) return b.angle - a.angle;
    return a.r - b.r;
  });

  const seatDots: SeatDot[] = rawPositions.slice(0, totalSeats).map((pos, idx) => {
    const owner = seatsList[idx] ?? {
      id: 'unassigned',
      acronym: 'Sin asignar',
      color: '#CBD5E1',
    };
    return {
      x: pos.x,
      y: pos.y,
      id: owner.id,
      acronym: owner.acronym,
      color: owner.color,
      seatIndex: idx + 1,
    };
  });

  const assignedCount = items.reduce((a, r) => a + r.seats, 0);
  const majorityNeeded = Math.floor(totalSeats / 2) + 1;
  const hoveredItem = items.find((r) => r.id === hoveredId);

  return (
    <div className="flex flex-col items-center">
      <div className="relative w-full max-w-[340px]">
        <svg
          viewBox="0 0 360 185"
          className="w-full h-auto overflow-visible"
          role="img"
          aria-label={`Distribución de ${assignedCount} de ${totalSeats} delegados`}
        >
          <line
            x1={cx}
            y1={cy - outerR - 14}
            x2={cx}
            y2={cy - innerR + 12}
            stroke="#CBD5E1"
            strokeWidth="1"
            strokeDasharray="3 3"
          />
          <text
            x={cx}
            y={cy - outerR - 18}
            textAnchor="middle"
            className="fill-slate-400 text-[10px] font-medium"
          >
            Mayoría: {majorityNeeded}
          </text>

          {seatDots.map((dot) => {
            const isDimmed = hoveredId !== null && hoveredId !== dot.id;
            return (
              <circle
                key={dot.seatIndex}
                cx={dot.x}
                cy={dot.y}
                r={totalSeats > 21 ? 7 : totalSeats > 13 ? 8.5 : 10.5}
                fill={dot.color}
                opacity={isDimmed ? 0.25 : 1}
                className="transition-opacity duration-150 cursor-pointer"
                onMouseEnter={() => dot.id !== 'unassigned' && setHoveredId(dot.id)}
                onMouseLeave={() => setHoveredId(null)}
              >
                <title>{`${dot.acronym} · Puesto #${dot.seatIndex}`}</title>
              </circle>
            );
          })}

          <text
            x={cx}
            y={cy - 18}
            textAnchor="middle"
            className="fill-slate-900 font-display font-bold text-3xl tabular-nums"
          >
            {hoveredItem ? hoveredItem.seats : assignedCount}
          </text>
          <text
            x={cx}
            y={cy}
            textAnchor="middle"
            className="fill-slate-500 text-[11px] font-medium"
          >
            {hoveredItem
              ? `${hoveredItem.acronym} · ${hoveredItem.pctOfValid.toFixed(1)}%`
              : `de ${totalSeats} puestos`}
          </text>
        </svg>
      </div>

      <div className="w-full mt-2 flex flex-wrap items-center justify-center gap-x-4 gap-y-1.5">
        {items.map((item) => (
          <button
            key={item.id}
            type="button"
            onMouseEnter={() => setHoveredId(item.id)}
            onMouseLeave={() => setHoveredId(null)}
            className="min-h-[34px] px-2 py-1 rounded-lg hover:bg-slate-100 flex items-center gap-2 text-xs text-slate-700 transition-colors cursor-pointer"
          >
            <span
              className="w-2.5 h-2.5 rounded-full shrink-0"
              style={{ backgroundColor: item.color }}
              aria-hidden="true"
            />
            <span className="font-semibold text-slate-900">{item.acronym}</span>
            <span className="tabular-nums text-slate-500">{item.seats}</span>
          </button>
        ))}
      </div>
    </div>
  );
};
