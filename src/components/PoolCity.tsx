import React, { useMemo, useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Text, Html, Billboard, Plane, Box } from '@react-three/drei';
import { useStore, Pool } from '../store/useStore';
import { cn } from '../lib/utils';
import * as THREE from 'three';

// ===== Seeded random position generator =====
function mulberry32(a: number) {
  return function () {
    a |= 0; a = a + 0x6d2b79f5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

function generateBuildingPositions(count: number, areaSize: number, minDist: number): [number, number][] {
  const positions: [number, number][] = [];
  const rng = mulberry32(Date.now() % 2147483647);
  let attempts = 0;
  while (positions.length < count && attempts < count * 100) {
    attempts++;
    const x = (rng() - 0.5) * areaSize;
    const z = (rng() - 0.5) * areaSize;
    if (Math.abs(x) < 2 && Math.abs(z) < 2) continue;
    let valid = true;
    for (const [px, pz] of positions) {
      const dx = Math.abs(x - px);
      const dz = Math.abs(z - pz);
      if (Math.sqrt(dx * dx + dz * dz) < minDist) {
        valid = false;
        break;
      }
    }
    if (valid) positions.push([x, z]);
  }
  return positions;
}

// ===== Building Component =====
interface BuildingProps {
  pool: Pool;
  position: [number, number];
  index: number;
  selected: string | null;
  onSelect: (id: string | null) => void;
}

function Building({ pool, position, index, selected, onSelect }: BuildingProps) {
  const meshRef = useRef<THREE.Mesh>(null);
  const [x, z] = position;

  const budget = pool.budget || 0;
  const balance = pool.balance || 0;
  const isOverBudget = budget > 0 && balance < 0;
  const isCardPool = !!pool.isCardPool;

  const baseHeight = Math.max(0.8, (budget / 5000) * 6);
  const height = Math.max(0.3, baseHeight);
  const width = 0.5 + Math.min(baseHeight * 0.15, 0.4);

  const isSelected = selected === pool.id;

  const mainColor = new THREE.Color(pool.color || '#64748b');
  const roofColor = isCardPool ? '#7c3aed' : mainColor.clone().multiplyScalar(1.3).getStyle();
  const bodyColor = isOverBudget ? '#ef4444' : mainColor.getStyle();

  const handleClick = (e: { stopPropagation: () => void }) => {
    e.stopPropagation();
    onSelect(isSelected ? null : pool.id);
  };

  useFrame((_, delta) => {
    if (meshRef.current) {
      const targetScale = isSelected ? 1.15 : 1;
      meshRef.current.scale.lerp(
        new THREE.Vector3(targetScale, targetScale, targetScale),
        delta * 8
      );
    }
  });

  return (
    <group>
      {/* Building group */}
      <mesh
        ref={meshRef}
        position={[x, height / 2, z]}
        onClick={handleClick}
      >
        <boxGeometry args={[width, height, width]} />
        <meshStandardMaterial color={bodyColor} roughness={0.3} metalness={0.1} />
      </mesh>

      {/* Roof */}
      <mesh position={[x, height + 0.08, z]} onClick={handleClick}>
        <boxGeometry args={[width + 0.06, 0.16, width + 0.06]} />
        <meshStandardMaterial color={roofColor} roughness={0.5} metalness={0.15} />
      </mesh>

      {/* Windows - front */}
      {Array.from({ length: Math.max(1, Math.floor(height * 1.5)) }).map((_, i) => (
        <mesh
          key={i}
          position={[x, 0.3 + i * 0.55, z + width / 2 + 0.01]}
        >
          <planeGeometry args={[width * 0.6, 0.35]} />
          <meshBasicMaterial color={isOverBudget ? '#fecaca' : '#dbeafe'} />
        </mesh>
      ))}

      {/* Windows - right side */}
      {Array.from({ length: Math.max(1, Math.floor(height * 1.5)) }).map((_, i) => (
        <mesh
          key={`right-${i}`}
          position={[x + width / 2 + 0.01, 0.3 + i * 0.55, z]}
          rotation={[0, Math.PI / 2, 0]}
        >
          <planeGeometry args={[width * 0.6, 0.35]} />
          <meshBasicMaterial color={isOverBudget ? '#fecaca' : '#dbeafe'} />
        </mesh>
      ))}

      {/* Card pool indicator */}
      {isCardPool && (
        <mesh position={[x, height + 0.24, z]} onClick={handleClick}>
          <sphereGeometry args={[0.12, 8, 8]} />
          <meshStandardMaterial color="#a855f7" emissive="#a855f7" emissiveIntensity={0.6} />
        </mesh>
      )}

      {/* Pool name label */}
      <Billboard position={[x, height + 0.6, z]}>
        <Text
          fontSize={0.25}
          color="#1e293b"
          anchorX="center"
          anchorY="middle"
          outlineWidth={0.04}
          outlineColor="#ffffff"
          maxWidth={2}
        >
          {pool.name.length > 6 ? pool.name.slice(0, 6) + '…' : pool.name}
        </Text>
      </Billboard>

      {/* Balance label */}
      <Billboard position={[x, height + 0.2, z]} visible={isSelected}>
        <Text
          fontSize={0.18}
          color={balance >= 0 ? '#16a34a' : '#dc2626'}
          anchorX="center"
          anchorY="middle"
          outlineWidth={0.03}
          outlineColor="#ffffff"
        >
          ¥{balance.toLocaleString()}
        </Text>
      </Billboard>
    </group>
  );
}

// ===== Ground with grid =====
function Ground() {
  return (
    <group>
      <Plane
        args={[30, 30]}
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, -0.05, 0]}
      >
        <meshStandardMaterial color="#e8f5e9" roughness={0.9} />
      </Plane>

      {/* Grid lines */}
      <gridHelper args={[30, 30, '#c8e6c9', '#c8e6c9']} position={[0, 0, 0]} />
    </group>
  );
}

// ===== Trees =====
function Tree({ position: [x, z] }: { position: [number, number] }) {
  return (
    <group position={[x, 0, z]}>
      <mesh position={[0, 0.3, 0]}>
        <cylinderGeometry args={[0.05, 0.06, 0.6, 6]} />
        <meshStandardMaterial color="#795548" />
      </mesh>
      <mesh position={[0, 0.8, 0]}>
        <coneGeometry args={[0.3, 0.7, 6]} />
        <meshStandardMaterial color="#66bb6a" />
      </mesh>
      <mesh position={[0, 1.3, 0]}>
        <coneGeometry args={[0.22, 0.5, 6]} />
        <meshStandardMaterial color="#81c784" />
      </mesh>
    </group>
  );
}

// ===== Empty State =====
function EmptyState() {
  return (
    <group>
      <Billboard position={[0, 1.5, 0]}>
        <Text
          fontSize={0.6}
          color="#94a3b8"
          anchorX="center"
          anchorY="middle"
        >
          暂无资金池
        </Text>
      </Billboard>
      <Text
        position={[0, 0.8, 0]}
        fontSize={0.25}
        color="#94a3b8"
        anchorX="center"
        anchorY="middle"
      >
        创建资金池来建造城市
      </Text>
    </group>
  );
}

// ===== Main Component =====
export default function PoolCity() {
  const { pools } = useStore();
  const [selected, setSelected] = React.useState<string | null>(null);

  const filteredPools = pools;

  const positions = useMemo(
    () => generateBuildingPositions(filteredPools.length || 1, 12, 2.5),
    [filteredPools.length]
  );

  const treePositions = useMemo(() => {
    const rng = mulberry32(Date.now() % 2147483647 + 42);
    const trees: [number, number][] = [];
    for (let i = 0; i < 30; i++) {
      const x = (rng() - 0.5) * 14;
      const z = (rng() - 0.5) * 14;
      let valid = true;
      for (const [px, pz] of positions) {
        if (Math.sqrt((x - px) ** 2 + (z - pz) ** 2) < 1.2) { valid = false; break; }
      }
      for (const [tx, tz] of trees) {
        if (Math.sqrt((x - tx) ** 2 + (z - tz) ** 2) < 0.8) { valid = false; break; }
      }
      if (valid) trees.push([x, z]);
    }
    return trees;
  }, [positions]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">城市视图</h2>
          <p className="text-sm text-gray-500 dark:text-slate-400 mt-1">
            点击建筑查看详情 · 拖拽旋转 · 滚轮缩放
          </p>
        </div>
      </div>

      {/* 3D Canvas */}
      <div className="bg-gradient-to-b from-sky-100 to-green-50 dark:from-slate-800 dark:to-slate-900 rounded-2xl overflow-hidden border border-gray-200 dark:border-slate-700" style={{ height: '70vh' }}>
        <Canvas
          camera={{ position: [8, 10, 8], fov: 50 }}
          shadows
          onClick={() => setSelected(null)}
        >
          <ambientLight intensity={0.6} />
          <directionalLight
            position={[10, 15, 5]}
            intensity={0.8}
            castShadow
            shadow-mapSize-width={1024}
            shadow-mapSize-height={1024}
          />
          <pointLight position={[-5, 8, -5]} intensity={0.3} color="#fde047" />

          <Ground />

          {filteredPools.map((pool, i) => (
            <Building
              key={pool.id}
              pool={pool}
              position={positions[i]}
              index={i}
              selected={selected}
              onSelect={setSelected}
            />
          ))}

          {filteredPools.length === 0 && <EmptyState />}

          {treePositions.slice(0, 25).map((pos, i) => (
            <Tree key={i} position={pos} />
          ))}

          <OrbitControls
            enableDamping
            dampingFactor={0.1}
            minDistance={3}
            maxDistance={20}
            maxPolarAngle={Math.PI / 2.2}
            target={[0, 0, 0]}
          />
          <fog attach="fog" args={['#e8f5e9', 15, 30]} />
        </Canvas>
      </div>

      {/* Pool legend */}
      {/* Selected pool info panel */}
      {selected && (() => {
        const sp = pools.find(p => p.id === selected);
        if (!sp) return null;
        const isOver = sp.budget > 0 && sp.balance < 0;
        const budgetUsage = sp.budget > 0 ? Math.round((sp.balance / sp.budget) * 100) : 0;
        return (
          <div className="bg-white dark:bg-slate-900 rounded-2xl p-5 shadow-sm border border-indigo-200 dark:border-indigo-700 ring-1 ring-indigo-100 dark:ring-indigo-900">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="w-4 h-4 rounded-full" style={{ backgroundColor: sp.color }} />
                <h3 className="font-semibold text-lg">{sp.name}</h3>
                {!!sp.isCardPool && <span className="text-xs text-purple-500 bg-purple-50 dark:bg-purple-900/30 px-2 py-0.5 rounded-full">储蓄卡池</span>}
              </div>
              <button onClick={() => setSelected(null)} className="text-gray-400 hover:text-gray-600 p-1">✕</button>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-gray-50 dark:bg-slate-800 rounded-xl p-3 text-center">
                <div className="text-2xl font-bold text-gray-800 dark:text-slate-100">¥{sp.balance.toLocaleString()}</div>
                <div className="text-xs text-gray-500 mt-1">当前余额</div>
              </div>
              <div className="bg-gray-50 dark:bg-slate-800 rounded-xl p-3 text-center">
                <div className="text-2xl font-bold text-gray-800 dark:text-slate-100">¥{sp.budget.toLocaleString()}</div>
                <div className="text-xs text-gray-500 mt-1">预算</div>
              </div>
              <div className="bg-gray-50 dark:bg-slate-800 rounded-xl p-3 text-center">
                <div className={cn("text-2xl font-bold", isOver ? "text-red-500" : "text-green-500")}>
                  {budgetUsage}%
                </div>
                <div className="text-xs text-gray-500 mt-1">使用率</div>
              </div>
              <div className="bg-gray-50 dark:bg-slate-800 rounded-xl p-3 text-center">
                <div className="text-2xl font-bold text-gray-800 dark:text-slate-100" style={{ color: sp.color }}>
                  ██
                </div>
                <div className="text-xs text-gray-500 mt-1">{sp.color}</div>
              </div>
            </div>
            {sp.budget > 0 && (
              <div className="mt-4">
                <div className="flex justify-between text-xs text-gray-500 mb-1">
                  <span>预算使用</span>
                  <span>{budgetUsage}%</span>
                </div>
                <div className="h-2 bg-gray-100 dark:bg-slate-700 rounded-full overflow-hidden">
                  <div className={cn("h-full rounded-full transition-all", isOver ? "bg-red-400" : "bg-indigo-400")}
                    style={{ width: `${Math.min(100, Math.abs(budgetUsage))}%` }} />
                </div>
              </div>
            )}
          </div>
        );
      })()}

      {/* Building quick list */}
      {filteredPools.length > 0 && (
        <div className="flex flex-wrap gap-3">
          {filteredPools.map(pool => {
            const isOver = pool.budget > 0 && pool.balance < 0;
            return (
              <button
                key={pool.id}
                onClick={() => setSelected(selected === pool.id ? null : pool.id)}
                className={cn(
                  "flex items-center gap-2 px-3 py-2 rounded-xl text-sm transition-all",
                  selected === pool.id
                    ? "bg-indigo-50 dark:bg-indigo-900/30 border border-indigo-200 dark:border-indigo-700 ring-2 ring-indigo-300"
                    : "bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-600 hover:border-indigo-300"
                )}
              >
                <span className="w-3 h-3 rounded-full" style={{ backgroundColor: pool.color }} />
                <span className="font-medium">{pool.name}</span>
                {!!pool.isCardPool && <span className="text-[10px] text-purple-500 bg-purple-50 dark:bg-purple-900/30 px-1 rounded">卡</span>}
                <span className={isOver ? 'text-red-500' : 'text-gray-400'}>
                  ¥{pool.balance.toLocaleString()}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
