import React, { useState, useMemo, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ZoomIn, ZoomOut, RotateCw, Building2, CreditCard } from 'lucide-react';
import { useStore } from '../store/useStore';
import type { Pool } from '../store/useStore.types';
import { cn } from '../lib/utils';
import { monthExpenseByPoolId } from '../lib/poolBudget';
import { apiGet } from '../lib/api';

interface CityMapProps {
  userTrustLevel?: number;
}

interface BuildingData {
  pool: Pool;
  x: number;
  y: number;
  spending: number;
  allocated: number;
  cardHolder?: string;
  cardNumber?: string;
}

const GRID_COLS = 9;
const GRID_ROWS = 7;
const TILE_W = 80;
const TILE_H = 46;

function isoToScreen(gx: number, gy: number, scale: number): { x: number; y: number } {
  const x = (gx - gy) * (TILE_W / 2) * scale;
  const y = (gx + gy) * (TILE_H / 2) * scale;
  return { x, y };
}

export default function CityMap({ userTrustLevel = 1 }: CityMapProps) {
  const { pools, transactions, baseCurrency } = useStore();
  const [scale, setScale] = useState(1);
  const [hoveredBuilding, setHoveredBuilding] = useState<string | null>(null);
  const [selectedBuilding, setSelectedBuilding] = useState<string | null>(null);
  const [cards, setCards] = useState<Record<string, { cardHolder: string; cardNumber: string }>>({});

  const expenseThisMonth = useMemo(() => monthExpenseByPoolId(transactions), [transactions]);
  const allocatedByPool = useMemo(() => {
    const map = new Map<string, number>();
    for (const pool of pools) {
      const spent = expenseThisMonth.get(pool.id) ?? 0;
      map.set(pool.id, pool.balance + spent);
    }
    return map;
  }, [pools, expenseThisMonth]);

  useEffect(() => {
    apiGet<{ cards: Array<{ id: string; card_holder: string; card_number: string; pool_id: string | null }> }>('/cards')
      .then(d => {
        const map: Record<string, { cardHolder: string; cardNumber: string }> = {};
        for (const c of d.cards || []) { if (c.pool_id) map[c.pool_id] = { cardHolder: c.card_holder, cardNumber: c.card_number }; }
        setCards(map);
      })
      .catch(() => {});
  }, []);

  const nonCardPools = pools.filter(p => !p.isCardPool);
  const cardPools = pools.filter(p => !!p.isCardPool);

  const buildings = useMemo<BuildingData[]>(() => {
    const allPools = [...nonCardPools, ...cardPools];
    const result = allPools.map((pool, index) => {
      const col = index % GRID_COLS;
      const row = Math.floor(index / GRID_COLS);
      return {
        pool,
        x: col,
        y: row,
        spending: expenseThisMonth.get(pool.id) ?? 0,
        allocated: allocatedByPool.get(pool.id) ?? 0,
        cardHolder: cards[pool.id]?.cardHolder,
        cardNumber: cards[pool.id]?.cardNumber,
      };
    });
    return result;
  }, [nonCardPools, cardPools, expenseThisMonth, allocatedByPool, cards]);

  const maxBudget = Math.max(1, ...pools.map(p => p.budget));
  const center = isoToScreen(GRID_COLS / 2, GRID_ROWS / 2, scale);
  const allPositions = buildings.map(b => isoToScreen(b.x, b.y, scale));

  const minSx = Math.min(...allPositions.map(p => p.x));
  const maxSx = Math.max(...allPositions.map(p => p.x));
  const minSy = Math.min(...allPositions.map(p => p.y));
  const maxSy = Math.max(...allPositions.map(p => p.y));

  const svgW = Math.max(800, maxSx - minSx + 200);
  const svgH = Math.max(600, maxSy - minSy + 200);
  const offsetX = svgW / 2 - (maxSx + minSx) / 2;
  const offsetY = 80 - minSy;

  const selectedData = selectedBuilding ? buildings.find(b => b.pool.id === selectedBuilding) : null;

  const getBuildingHeight = (budget: number) => Math.max(20, (budget / maxBudget) * 120);
  const getBuildingColor = (pool: Pool, spending: number, allocated: number) => {
    if (pool.budget > 0 && spending > pool.budget) return { base: '#ef4444', light: '#f87171', dark: '#b91c1c' };
    if (pool.budget > 0 && allocated > pool.budget * 0.8) return { base: '#f59e0b', light: '#fbbf24', dark: '#b45309' };
    return { base: pool.color, light: pool.color + '99', dark: pool.color + 'cc' };
  };

  const getWaterLevel = (pool: Pool) => {
    if (pool.budget <= 0) return 0;
    return Math.min(1, pool.balance / pool.budget);
  };

  const renderBuildingTile = (building: BuildingData, sx: number, sy: number) => {
    const { pool, spending, allocated } = building;
    const h = getBuildingHeight(pool.budget);
    const colors = getBuildingColor(pool, spending, allocated);
    const water = getWaterLevel(pool);
    const isCard = !!pool.isCardPool;
    const isSelected = selectedBuilding === pool.id;
    const isHovered = hoveredBuilding === pool.id;
    const depth = h * 0.15;

    return (
      <g
        key={pool.id}
        transform={`translate(${sx + offsetX}, ${sy + offsetY})`}
        onMouseEnter={() => setHoveredBuilding(pool.id)}
        onMouseLeave={() => setHoveredBuilding(null)}
        onClick={() => setSelectedBuilding(isSelected ? null : pool.id)}
        style={{ cursor: 'pointer' }}
        className="transition-all duration-200"
      >
        {/* Building shadow */}
        <ellipse
          cx={0} cy={h * 0.4} rx={TILE_W * 0.52 * scale} ry={TILE_H * 0.2 * scale}
          fill="rgba(0,0,0,0.15)"
        />

        {/* Top face (roof) */}
        <path
          d={`M${-TILE_W / 2 * scale},${-h / 2} L0,${-TILE_H / 2 * scale - h / 2} L${TILE_W / 2 * scale},${-h / 2} L0,${TILE_H / 2 * scale - h / 2} Z`}
          fill={colors.light}
          stroke={colors.dark}
          strokeWidth={1.5}
        />
        {/* Roof decorative edge for card pools */}
        {isCard && (
          <path
            d={`M${-TILE_W / 2 * scale},${-h / 2} L0,${-TILE_H / 2 * scale - h / 2} L${TILE_W / 2 * scale},${-h / 2} L0,${TILE_H / 2 * scale - h / 2} Z`}
            fill="none"
            stroke="#a855f7"
            strokeWidth={3}
            strokeDasharray="4 2"
          />
        )}

        {/* Front-left face */}
        <path
          d={`M${-TILE_W / 2 * scale},${-h / 2} L0,${-TILE_H / 2 * scale - h / 2} L0,${-TILE_H / 2 * scale} L${-TILE_W / 2 * scale},0 Z`}
          fill={colors.dark}
          stroke={colors.base}
          strokeWidth={1}
        />
        
        {/* Front-right face */}
        <path
          d={`M0,${-TILE_H / 2 * scale - h / 2} L${TILE_W / 2 * scale},${-h / 2} L${TILE_W / 2 * scale},${0} L0,${-TILE_H / 2 * scale} Z`}
          fill={colors.base}
          stroke={colors.dark}
          strokeWidth={1}
        />

        {/* Water level inside right face */}
        {pool.budget > 0 && water > 0.02 && (
          <path
            d={`M0,${-TILE_H / 2 * scale - h / 2 + h * (1 - water)} L${TILE_W / 2 * scale},${-h / 2 + h * (1 - water)} L${TILE_W / 2 * scale},${0} L0,${-TILE_H / 2 * scale} Z`}
            fill={isCard ? 'rgba(147,51,234,0.35)' : 'rgba(59,130,246,0.3)'}
          />
        )}

        {/* Selection / hover highlight */}
        {(isSelected || isHovered) && (
          <path
            d={`M${-TILE_W / 2 * scale - 2},${-h / 2 - 2} L0,${-TILE_H / 2 * scale - h / 2 - 2} L${TILE_W / 2 * scale + 2},${-h / 2 - 2} L0,${TILE_H / 2 * scale - h / 2 + 2} Z`}
            fill="none"
            stroke={isSelected ? '#3b82f6' : '#93c5fd'}
            strokeWidth={isSelected ? 3 : 2}
            opacity={isSelected ? 1 : 0.6}
          />
        )}

        {/* Floor tile */}
        <path
          d={`M${-TILE_W / 2 * scale},0 L0,${-TILE_H / 2 * scale} L${TILE_W / 2 * scale},0 L0,${TILE_H / 2 * scale} Z`}
          fill="rgba(255,255,255,0.05)"
          stroke="rgba(255,255,255,0.1)"
          strokeWidth={0.5}
        />

        {/* Building label */}
        <foreignObject
          x={-TILE_W * 0.35 * scale}
          y={-h / 2 - 28}
          width={TILE_W * 0.7 * scale}
          height={24}
        >
          <div className="flex items-center justify-center" style={{ pointerEvents: 'none' }}>
            <div className={cn(
              "text-[10px] font-bold text-center truncate px-1.5 py-0.5 rounded-full bg-black/40 text-white whitespace-nowrap",
              isCard && "ring-1 ring-purple-400"
            )} style={{ maxWidth: TILE_W * 0.65 * scale }}>
              {isCard ? (building.cardHolder || '储蓄卡') : pool.name}
            </div>
          </div>
        </foreignObject>

        {/* Water level indicator badge */}
        {pool.budget > 0 && (
          <foreignObject
            x={-24}
            y={TILE_H * 0.3 * scale}
            width={48}
            height={18}
          >
            <div className="flex items-center justify-center" style={{ pointerEvents: 'none' }}>
              <span className="text-[9px] font-mono px-1.5 py-0.5 rounded-full bg-black/50 text-white">
                {Math.round(water * 100)}%
              </span>
            </div>
          </foreignObject>
        )}
      </g>
    );
  };

  // Order buildings by y then x for proper isometric depth sorting
  const sortedBuildings = [...buildings].sort((a, b) => (a.x + a.y) - (b.x + b.y));

  return (
    <div className="max-w-6xl mx-auto space-y-4 animate-in fade-in duration-300">
      {/* Header */}
      <div className="bg-gradient-to-r from-emerald-500 to-teal-600 rounded-2xl p-6 text-white">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h2 className="text-2xl font-bold flex items-center gap-2">
              <Building2 className="w-8 h-8" />
              资金城市
            </h2>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setScale(s => Math.max(0.5, s - 0.1))} className="p-2 bg-white/20 hover:bg-white/30 rounded-lg transition-colors" title="缩小">
              <ZoomOut size={18} />
            </button>
            <span className="text-sm font-mono">{Math.round(scale * 100)}%</span>
            <button onClick={() => setScale(s => Math.min(2, s + 0.1))} className="p-2 bg-white/20 hover:bg-white/30 rounded-lg transition-colors" title="放大">
              <ZoomIn size={18} />
            </button>
            <button onClick={() => setScale(1)} className="p-2 bg-white/20 hover:bg-white/30 rounded-lg transition-colors" title="重置">
              <RotateCw size={18} />
            </button>
          </div>
        </div>
        <p className="text-sm text-emerald-100 mt-2">
          建筑高度 = 预算规模 · 水面高度 = 余额占比 · 红色 = 超预算 · 紫色边框 = 储蓄卡
        </p>
      </div>

      {/* Main city view */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-gray-100 dark:border-slate-700 overflow-hidden">
        <div className="relative" style={{ background: 'linear-gradient(180deg, #f0fdf4 0%, #dcfce7 30%, #bbf7d0 100%)' }}>
          <svg
            viewBox={`0 0 ${svgW} ${svgH}`}
            width="100%"
            height="650"
            className="block"
          >
            {/* Ground plane */}
            <rect x={0} y={0} width={svgW} height={svgH} fill="transparent" />
            
            {sortedBuildings.map(b => {
              const { x: sx, y: sy } = isoToScreen(b.x, b.y, scale);
              return renderBuildingTile(b, sx, sy);
            })}
          </svg>

          {/* Empty state */}
          {pools.length === 0 && (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="text-center text-gray-400">
                <Building2 size={64} className="mx-auto mb-4 opacity-30" />
                <p className="text-lg">城市尚未建设</p>
                <p className="text-sm">前往资金池页面创建你的第一个建筑</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Selected building detail panel */}
      <AnimatePresence>
        {selectedData && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="bg-white dark:bg-slate-800 rounded-2xl p-6 shadow-sm border border-gray-100 dark:border-slate-700"
          >
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ backgroundColor: selectedData.pool.color + '20' }}>
                  <Building2 size={20} style={{ color: selectedData.pool.color }} />
                </div>
                <div>
                  <h3 className="text-lg font-semibold">{selectedData.pool.name}</h3>
                  {!!selectedData.pool.isCardPool && selectedData.cardHolder && (
                    <p className="text-xs text-purple-500 flex items-center gap-1">
                      <CreditCard size={12} />{selectedData.cardHolder} · {selectedData.cardNumber?.slice(-8)}
                    </p>
                  )}
                </div>
              </div>
              <button onClick={() => setSelectedBuilding(null)} className="p-2 text-gray-400 hover:text-gray-600">✕</button>
            </div>
            
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-gray-50 dark:bg-slate-700 rounded-xl p-3 text-center">
                <p className="text-xs text-gray-500 mb-1">余额</p>
                <p className="text-xl font-bold">{selectedData.pool.balance.toLocaleString('zh-CN', { minimumFractionDigits: 2 })}</p>
                <p className="text-xs text-gray-400">{baseCurrency}</p>
              </div>
              <div className="bg-gray-50 dark:bg-slate-700 rounded-xl p-3 text-center">
                <p className="text-xs text-gray-500 mb-1">预算</p>
                <p className="text-xl font-bold">{selectedData.pool.budget.toLocaleString('zh-CN', { minimumFractionDigits: 2 })}</p>
                <p className="text-xs text-gray-400">{baseCurrency}</p>
              </div>
              <div className="bg-gray-50 dark:bg-slate-700 rounded-xl p-3 text-center">
                <p className="text-xs text-gray-500 mb-1">本月支出</p>
                <p className={cn("text-xl font-bold", selectedData.pool.budget > 0 && selectedData.spending > selectedData.pool.budget && "text-red-500")}>
                  -{selectedData.spending.toLocaleString('zh-CN', { minimumFractionDigits: 2 })}
                </p>
                <p className="text-xs text-gray-400">{baseCurrency}</p>
              </div>
              <div className="bg-gray-50 dark:bg-slate-700 rounded-xl p-3 text-center">
                <p className="text-xs text-gray-500 mb-1">水位</p>
                <p className="text-xl font-bold">
                  {selectedData.pool.budget > 0 ? Math.round((selectedData.pool.balance / selectedData.pool.budget) * 100) : 0}%
                </p>
                <div className="mt-1 h-1.5 bg-gray-200 dark:bg-slate-600 rounded-full overflow-hidden mx-auto max-w-[80px]">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{
                      width: `${Math.min(100, selectedData.pool.budget > 0 ? (selectedData.pool.balance / selectedData.pool.budget) * 100 : 0)}%`,
                      backgroundColor: selectedData.pool.budget > 0 && selectedData.spending > selectedData.pool.budget ? '#ef4444' : selectedData.pool.color,
                    }}
                  />
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
