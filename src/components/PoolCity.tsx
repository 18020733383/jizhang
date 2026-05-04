import React, { useMemo, useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Text, Billboard, Plane } from '@react-three/drei';
import { useStore, Pool } from '../store/useStore';
import { CreditCard, X } from 'lucide-react';
import * as THREE from 'three';

function mulberry32(a: number) {
  return function () { a |= 0; a = a + 0x6d2b79f5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
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
      if (Math.sqrt((x - px) ** 2 + (z - pz) ** 2) < minDist) { valid = false; break; }
    }
    if (valid) positions.push([x, z]);
  }
  return positions;
}

interface BuildingProps {
  pool: Pool;
  position: [number, number];
  selected: boolean;
  onSelect: (id: string) => void;
}

function Building({ pool, position, selected, onSelect }: BuildingProps) {
  const outlineRef = useRef<THREE.Mesh>(null);
  const [x, z] = position;

  const budget = pool.budget || 0;
  const balance = pool.balance || 0;
  const isOverBudget = budget > 0 && balance < 0;
  const isCardPool = !!pool.isCardPool;

  const baseHeight = Math.max(0.8, (budget / 5000) * 6);
  const height = Math.max(0.3, baseHeight);
  const width = 0.5 + Math.min(baseHeight * 0.15, 0.4);

  const mainColor = new THREE.Color(pool.color || '#64748b');
  const roofColor = isCardPool ? '#7c3aed' : mainColor.clone().multiplyScalar(1.3).getStyle();
  const bodyColor = isOverBudget ? '#ef4444' : mainColor.getStyle();
  const windowCount = Math.max(1, Math.floor(height * 1.5));

  useFrame((_, delta) => {
    if (outlineRef.current) {
      const targetScale = selected ? 1.06 : 1;
      outlineRef.current.scale.lerp(new THREE.Vector3(targetScale, targetScale, targetScale), delta * 8);
      const mat = outlineRef.current.material as THREE.MeshBasicMaterial;
      mat.opacity = THREE.MathUtils.lerp(mat.opacity, selected ? 0.6 : 0, delta * 8);
    }
  });

  return (
    <group>
      {/* Building body */}
      <mesh position={[x, height / 2, z]} onClick={(e) => { e.stopPropagation(); onSelect(pool.id); }}>
        <boxGeometry args={[width, height, width]} />
        <meshStandardMaterial color={bodyColor} roughness={0.3} metalness={0.1} />
      </mesh>

      {/* Roof */}
      <mesh position={[x, height + 0.08, z]} onClick={(e) => { e.stopPropagation(); onSelect(pool.id); }}>
        <boxGeometry args={[width + 0.06, 0.16, width + 0.06]} />
        <meshStandardMaterial color={roofColor} roughness={0.5} metalness={0.15} />
      </mesh>

      {/* Windows - front */}
      {Array.from({ length: windowCount }).map((_, i) => (
        <mesh key={i} position={[x, 0.3 + i * 0.55, z + width / 2 + 0.01]}>
          <planeGeometry args={[width * 0.6, 0.35]} />
          <meshBasicMaterial color={isOverBudget ? '#fecaca' : '#dbeafe'} />
        </mesh>
      ))}

      {/* Windows - right */}
      {Array.from({ length: windowCount }).map((_, i) => (
        <mesh key={`r${i}`} position={[x + width / 2 + 0.01, 0.3 + i * 0.55, z]} rotation={[0, Math.PI / 2, 0]}>
          <planeGeometry args={[width * 0.6, 0.35]} />
          <meshBasicMaterial color={isOverBudget ? '#fecaca' : '#dbeafe'} />
        </mesh>
      ))}

      {/* Card pool indicator */}
      {isCardPool && (
        <mesh position={[x, height + 0.24, z]}>
          <sphereGeometry args={[0.12, 8, 8]} />
          <meshStandardMaterial color="#a855f7" emissive="#a855f7" emissiveIntensity={0.6} />
        </mesh>
      )}

      {/* Selection outline - semi-transparent highlight */}
      <mesh ref={outlineRef} position={[x, height / 2, z]} renderOrder={1}>
        <boxGeometry args={[width + 0.12, height + 0.12, width + 0.12]} />
        <meshBasicMaterial color="#6366f1" transparent opacity={0} depthWrite={false} />
      </mesh>

      {/* Building label */}
      <Billboard position={[x, height + 0.55, z]}>
        <Text fontSize={0.25} color="#1e293b" anchorX="center" anchorY="middle" outlineWidth={0.04} outlineColor="#ffffff" maxWidth={2}>
          {pool.name.length > 6 ? pool.name.slice(0, 6) + '…' : pool.name}
        </Text>
      </Billboard>

      {/* Balance label when selected */}
      {selected && (
        <Billboard position={[x, height + 0.2, z]}>
          <Text fontSize={0.18} color={balance >= 0 ? '#16a34a' : '#dc2626'} anchorX="center" anchorY="middle" outlineWidth={0.03} outlineColor="#ffffff">
            ¥{balance.toLocaleString()}
          </Text>
        </Billboard>
      )}

      {/* 3D pointer indicator when selected */}
      {selected && (
        <mesh position={[x, height + 0.45, z]}>
          <ringGeometry args={[0.15, 0.2, 32]} />
          <meshBasicMaterial color="#6366f1" side={THREE.DoubleSide} transparent opacity={0.8} />
        </mesh>
      )}
    </group>
  );
}

function Ground() {
  return (
    <group>
      <Plane args={[30, 30]} rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.05, 0]}>
        <meshStandardMaterial color="#e8f5e9" roughness={0.9} />
      </Plane>
      <gridHelper args={[30, 30, '#c8e6c9', '#c8e6c9']} position={[0, 0, 0]} />
    </group>
  );
}

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

function EmptyState() {
  return (
    <group>
      <Billboard position={[0, 1.5, 0]}>
        <Text fontSize={0.6} color="#94a3b8" anchorX="center" anchorY="middle">暂无资金池</Text>
      </Billboard>
      <Text position={[0, 0.8, 0]} fontSize={0.25} color="#94a3b8" anchorX="center" anchorY="middle">创建资金池来建造城市</Text>
    </group>
  );
}

export default function PoolCity() {
  const { pools } = useStore();
  const [selectedId, setSelectedId] = React.useState<string | null>(null);

  const filteredPools = pools;
  const selectedPool = filteredPools.find(p => p.id === selectedId) || null;

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
      <div>
        <h2 className="text-lg font-semibold">城市视图</h2>
        <p className="text-sm text-gray-500 dark:text-slate-400 mt-1">每个资金池为一座建筑 · 高度=预算 · 拖拽旋转缩放 · 点击建筑看详情</p>
      </div>

      {/* 3D Canvas with overlay containers */}
      <div className="relative bg-gradient-to-b from-sky-100 to-green-50 dark:from-slate-800 dark:to-slate-900 rounded-2xl overflow-hidden border border-gray-200 dark:border-slate-700" style={{ height: '65vh' }}>
        <Canvas camera={{ position: [8, 10, 8], fov: 50 }} onClick={() => setSelectedId(null)}>
          <ambientLight intensity={0.6} />
          <directionalLight position={[10, 15, 5]} intensity={0.8} />
          <pointLight position={[-5, 8, -5]} intensity={0.3} color="#fde047" />

          <Ground />

          {filteredPools.map((pool, i) => (
            <Building
              key={pool.id}
              pool={pool}
              position={positions[i]}
              selected={selectedId === pool.id}
              onSelect={setSelectedId}
            />
          ))}

          {filteredPools.length === 0 && <EmptyState />}

          {treePositions.slice(0, 25).map((pos, i) => <Tree key={i} position={pos} />)}

          <OrbitControls enableDamping dampingFactor={0.1} minDistance={3} maxDistance={20} maxPolarAngle={Math.PI / 2.2} target={[0, 0, 0]} />
          <fog attach="fog" args={['#e8f5e9', 15, 30]} />
        </Canvas>

        {/* Floating pool legend - bottom center */}
        {filteredPools.length > 0 && (
          <div className="absolute bottom-4 left-4 right-4 flex flex-wrap gap-2 justify-center pointer-events-none">
            <div className="flex flex-wrap gap-2 p-2 bg-white/90 dark:bg-slate-800/90 backdrop-blur-sm rounded-xl shadow-lg pointer-events-auto">
              {filteredPools.map(pool => {
                const isOver = pool.budget > 0 && pool.balance < 0;
                return (
                  <button
                    key={pool.id}
                    onClick={() => setSelectedId(selectedId === pool.id ? null : pool.id)}
                    className={selectedId === pool.id
                      ? "flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-100 dark:bg-indigo-900/40 border border-indigo-300 dark:border-indigo-600 text-xs font-medium ring-1 ring-indigo-400"
                      : "flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/80 dark:bg-slate-700/80 text-xs hover:bg-white dark:hover:bg-slate-600 transition-colors"
                    }
                  >
                    <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: pool.color }} />
                    <span className="truncate max-w-[100px]">{pool.name}</span>
                    {!!pool.isCardPool && <span className="text-[9px] text-purple-500 shrink-0">卡</span>}
                    <span className={isOver ? 'text-red-500 shrink-0' : 'text-gray-500 dark:text-slate-400 shrink-0'}>
                      ¥{pool.balance >= 0 ? pool.balance.toLocaleString() : '0'}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Floating info card - top right */}
        {selectedPool && (
          <div className="absolute top-4 right-4 w-72 bg-white/95 dark:bg-slate-800/95 backdrop-blur-md rounded-2xl shadow-2xl border border-indigo-200 dark:border-indigo-700 p-5 pointer-events-auto animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2 min-w-0">
                <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0" style={{ background: selectedPool.color + '20' }}>
                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: selectedPool.color }} />
                </div>
                <div className="min-w-0">
                  <h3 className="font-semibold text-sm truncate flex items-center gap-1.5">
                    {selectedPool.name}
                    {!!selectedPool.isCardPool && (
                      <span className="text-[9px] bg-purple-100 dark:bg-purple-900/40 text-purple-600 dark:text-purple-400 px-1.5 py-0.5 rounded-full flex items-center gap-0.5 shrink-0">
                        <CreditCard size={9} /> 卡
                      </span>
                    )}
                  </h3>
                </div>
              </div>
              <button onClick={() => setSelectedId(null)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-700 shrink-0">
                <X size={16} />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2 mb-3">
              <div className="p-3 bg-gray-50 dark:bg-slate-700/50 rounded-xl">
                <p className="text-[10px] text-gray-400 dark:text-slate-500 mb-0.5">余额</p>
                <p className={selectedPool.balance < 0 ? 'text-red-500 text-base font-bold' : 'text-gray-900 dark:text-slate-100 text-base font-bold'}>
                  ¥{selectedPool.balance.toLocaleString('zh-CN', { minimumFractionDigits: 2 })}
                </p>
              </div>
              <div className="p-3 bg-gray-50 dark:bg-slate-700/50 rounded-xl">
                <p className="text-[10px] text-gray-400 dark:text-slate-500 mb-0.5">预算</p>
                <p className="text-gray-900 dark:text-slate-100 text-base font-bold">
                  ¥{selectedPool.budget.toLocaleString('zh-CN', { minimumFractionDigits: 2 })}
                </p>
              </div>
            </div>

            <div className="h-2 bg-gray-200 dark:bg-slate-700 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all"
                style={{
                  width: `${Math.min(100, Math.max(0, (Math.max(0, selectedPool.balance) / Math.max(1, selectedPool.budget)) * 100))}%`,
                  background: selectedPool.balance < 0 ? '#ef4444' : selectedPool.balance > selectedPool.budget ? '#f59e0b' : selectedPool.color,
                }}
              />
            </div>
            <p className="text-[10px] text-gray-400 mt-1.5 text-center">
              {selectedPool.budget > 0
                ? `预算使用率 ${Math.round((Math.max(0, selectedPool.balance) / selectedPool.budget) * 100)}%`
                : '未设置预算'}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
