import React, { useMemo, useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Text, Billboard, Plane } from '@react-three/drei';
import { useStore, Pool, Transaction } from '../store/useStore';
import { CreditCard, X } from 'lucide-react';
import * as THREE from 'three';

function mulberry32(seed: number) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let value = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function generateBuildingPositions(count: number, areaSize: number, minDist: number): [number, number][] {
  const positions: [number, number][] = [];
  const rng = mulberry32(20250308 + count * 97);
  let attempts = 0;

  while (positions.length < count && attempts < count * 100) {
    attempts += 1;
    const x = (rng() - 0.5) * areaSize;
    const z = (rng() - 0.5) * areaSize;

    if (Math.abs(x) < 2 && Math.abs(z) < 2) continue;

    let valid = true;
    for (const [px, pz] of positions) {
      if (Math.hypot(x - px, z - pz) < minDist) {
        valid = false;
        break;
      }
    }

    if (valid) positions.push([x, z]);
  }

  return positions;
}

type PoolStyleKey = 'food' | 'home' | 'travel' | 'study' | 'shopping' | 'fun' | 'health' | 'saving' | 'mixed';

interface PoolStyleProfile {
  key: PoolStyleKey;
  label: string;
  description: string;
  accent: string;
  roof: string;
  window: string;
}

const STYLE_PROFILES: Record<PoolStyleKey, PoolStyleProfile> = {
  food: { key: 'food', label: '餐饮型', description: '更像餐馆或小食堂，暖光和招牌感更明显。', accent: '#f97316', roof: '#fb923c', window: '#fde68a' },
  home: { key: 'home', label: '居家型', description: '偏住宅感，轮廓更稳重，适合房租和生活日用。', accent: '#6366f1', roof: '#818cf8', window: '#dbeafe' },
  travel: { key: 'travel', label: '出行型', description: '更像交通枢纽或航站楼，顶部更有导向感。', accent: '#06b6d4', roof: '#22d3ee', window: '#a5f3fc' },
  study: { key: 'study', label: '学习型', description: '偏学院或图书馆风格，整体更冷静。', accent: '#3b82f6', roof: '#60a5fa', window: '#bfdbfe' },
  shopping: { key: 'shopping', label: '购物型', description: '更像商场或橱窗店面，装饰更醒目。', accent: '#ec4899', roof: '#f472b6', window: '#fbcfe8' },
  fun: { key: 'fun', label: '娱乐型', description: '偏霓虹娱乐风，氛围感更强。', accent: '#a855f7', roof: '#c084fc', window: '#e9d5ff' },
  health: { key: 'health', label: '健康型', description: '偏医疗与保健风格，色调更清爽。', accent: '#10b981', roof: '#34d399', window: '#bbf7d0' },
  saving: { key: 'saving', label: '储蓄型', description: '更像金库或稳健资产楼，顶部有金色点缀。', accent: '#eab308', roof: '#facc15', window: '#fef08a' },
  mixed: { key: 'mixed', label: '综合型', description: '消费较分散，维持综合城市建筑风格。', accent: '#64748b', roof: '#94a3b8', window: '#dbeafe' },
};

const CATEGORY_KEYWORDS: Record<Exclude<PoolStyleKey, 'saving' | 'mixed'>, string[]> = {
  food: ['吃', '餐', '饭', '奶茶', '咖啡', '早餐', '午餐', '晚餐', '外卖', '火锅', '烧烤', '零食'],
  home: ['房租', '租', '物业', '电费', '水费', '燃气', '家', '日用', '家居', '床', '厨房', '维修'],
  travel: ['地铁', '公交', '打车', '高铁', '机票', '火车', '加油', '停车', '出行', '通勤', '滴滴', '旅行'],
  study: ['书', '课程', '学费', '学习', '培训', '考试', '教育', '资料', '订阅', '软件', '办公'],
  shopping: ['购物', '衣服', '鞋', '裤', '淘宝', '京东', '拼多多', '数码', '手机', '电脑', '配件'],
  fun: ['电影', '游戏', '娱乐', 'ktv', '酒吧', '聚会', '演出', '景点', '玩', '手办'],
  health: ['医院', '药', '看病', '体检', '健康', '牙', '保健', '挂号', '医疗', '医保'],
};

function detectExpenseStyle(note: string): Exclude<PoolStyleKey, 'saving' | 'mixed'> | null {
  const normalized = note.trim().toLowerCase();
  if (!normalized) return null;

  for (const [key, words] of Object.entries(CATEGORY_KEYWORDS) as [Exclude<PoolStyleKey, 'saving' | 'mixed'>, string[]][]) {
    if (words.some((word) => normalized.includes(word))) {
      return key;
    }
  }

  return null;
}

function derivePoolStyle(pool: Pool, transactions: Transaction[]): PoolStyleProfile {
  const related = transactions.filter((transaction) =>
    (transaction.type === 'expense' || transaction.type === 'intercept') && transaction.poolId === pool.id
  );

  const scores = new Map<Exclude<PoolStyleKey, 'saving' | 'mixed'>, number>();
  let savingWeight = 0;

  for (const transaction of related) {
    if (transaction.type === 'intercept') {
      savingWeight += Math.max(1, transaction.amount);
      continue;
    }

    const style = detectExpenseStyle(transaction.note || '');
    if (style) {
      scores.set(style, (scores.get(style) ?? 0) + Math.max(1, transaction.amount));
    }
  }

  const topStyle = [...scores.entries()].sort((left, right) => right[1] - left[1])[0]?.[0];
  if (topStyle) return STYLE_PROFILES[topStyle];
  if (pool.isCardPool || savingWeight > 0) return STYLE_PROFILES.saving;
  return STYLE_PROFILES.mixed;
}

interface BuildingProps {
  pool: Pool;
  position: [number, number];
  selected: boolean;
  onSelect: (id: string) => void;
  styleProfile: PoolStyleProfile;
}

function Building({ pool, position, selected, onSelect, styleProfile }: BuildingProps) {
  const outlineRef = useRef<THREE.Mesh>(null);
  const bodyRef = useRef<THREE.Mesh>(null);
  const roofRef = useRef<THREE.Mesh>(null);
  const markerRef = useRef<THREE.Mesh>(null);
  const [x, z] = position;

  const budget = pool.budget || 0;
  const balance = pool.balance || 0;
  const isOverBudget = budget > 0 && balance < 0;
  const isCardPool = !!pool.isCardPool;

  const baseHeight = Math.max(0.8, (budget / 5000) * 6);
  const height = Math.max(0.3, baseHeight);
  const width = 0.5 + Math.min(baseHeight * 0.15, 0.4);

  const mainColor = new THREE.Color(pool.color || '#64748b');
  const roofColor = isCardPool ? '#7c3aed' : styleProfile.roof;
  const bodyColor = isOverBudget ? '#ef4444' : mainColor.getStyle();
  const windowColor = isOverBudget ? '#fecaca' : styleProfile.window;
  const windowCount = Math.max(1, Math.floor(height * 1.5));
  const phase = useMemo(() => (x * 0.73 + z * 1.17) * 0.6, [x, z]);

  useFrame((state, delta) => {
    const elapsed = state.clock.getElapsedTime();
    const bob = Math.sin(elapsed * 1.2 + phase) * 0.04;

    if (bodyRef.current) {
      bodyRef.current.position.y = height / 2 + bob + (selected ? 0.08 : 0);
      bodyRef.current.rotation.y = THREE.MathUtils.lerp(bodyRef.current.rotation.y, selected ? 0.08 : 0, delta * 6);
    }

    if (roofRef.current) {
      roofRef.current.position.y = height + 0.08 + bob + (selected ? 0.08 : 0);
      roofRef.current.rotation.y = THREE.MathUtils.lerp(roofRef.current.rotation.y, selected ? -0.08 : 0, delta * 6);
    }

    if (outlineRef.current) {
      const targetScale = selected ? 1.06 : 1;
      outlineRef.current.scale.lerp(new THREE.Vector3(targetScale, targetScale, targetScale), delta * 8);
      outlineRef.current.position.y = height / 2 + bob + (selected ? 0.08 : 0);
      const material = outlineRef.current.material as THREE.MeshBasicMaterial;
      material.opacity = THREE.MathUtils.lerp(material.opacity, selected ? 0.6 : 0, delta * 8);
      material.color.set(styleProfile.accent);
    }

    if (markerRef.current) {
      markerRef.current.position.y = height + 0.45 + Math.sin(elapsed * 3 + phase) * 0.06;
      markerRef.current.rotation.y += delta * 1.8;
      const material = markerRef.current.material as THREE.MeshBasicMaterial;
      material.opacity = THREE.MathUtils.lerp(material.opacity, selected ? 0.85 : 0, delta * 10);
      material.color.set(styleProfile.accent);
    }
  });

  return (
    <group>
      <mesh
        ref={bodyRef}
        position={[x, height / 2, z]}
        onClick={(event) => {
          event.stopPropagation();
          onSelect(pool.id);
        }}
        onPointerOver={(event) => {
          event.stopPropagation();
          document.body.style.cursor = 'pointer';
        }}
        onPointerOut={() => {
          document.body.style.cursor = 'default';
        }}
      >
        <boxGeometry args={[width, height, width]} />
        <meshStandardMaterial
          color={bodyColor}
          roughness={0.3}
          metalness={0.1}
          emissive={selected ? styleProfile.accent : '#000000'}
          emissiveIntensity={selected ? 0.2 : 0}
        />
      </mesh>

      <mesh ref={roofRef} position={[x, height + 0.08, z]} onClick={(event) => { event.stopPropagation(); onSelect(pool.id); }}>
        <boxGeometry args={[width + 0.06, 0.16, width + 0.06]} />
        <meshStandardMaterial color={roofColor} roughness={0.5} metalness={0.15} />
      </mesh>

      {Array.from({ length: windowCount }).map((_, index) => (
        <mesh key={index} position={[x, 0.3 + index * 0.55, z + width / 2 + 0.01]}>
          <planeGeometry args={[width * 0.6, 0.35]} />
          <meshBasicMaterial color={windowColor} />
        </mesh>
      ))}

      {Array.from({ length: windowCount }).map((_, index) => (
        <mesh key={`r${index}`} position={[x + width / 2 + 0.01, 0.3 + index * 0.55, z]} rotation={[0, Math.PI / 2, 0]}>
          <planeGeometry args={[width * 0.6, 0.35]} />
          <meshBasicMaterial color={windowColor} />
        </mesh>
      ))}

      {styleProfile.key === 'food' && (
        <mesh position={[x, 0.8, z + width / 2 + 0.08]}>
          <boxGeometry args={[width * 0.9, 0.12, 0.08]} />
          <meshStandardMaterial color={styleProfile.accent} emissive={styleProfile.accent} emissiveIntensity={0.2} />
        </mesh>
      )}

      {styleProfile.key === 'home' && (
        <mesh position={[x + width * 0.28, height + 0.28, z - width * 0.18]}>
          <cylinderGeometry args={[0.05, 0.05, 0.35, 6]} />
          <meshStandardMaterial color="#cbd5e1" />
        </mesh>
      )}

      {styleProfile.key === 'travel' && (
        <mesh position={[x, height + 0.38, z]}>
          <coneGeometry args={[0.09, 0.42, 6]} />
          <meshStandardMaterial color={styleProfile.accent} emissive={styleProfile.accent} emissiveIntensity={0.35} />
        </mesh>
      )}

      {styleProfile.key === 'study' && (
        <mesh position={[x, height + 0.22, z]}>
          <boxGeometry args={[width * 0.45, 0.1, width * 0.85]} />
          <meshStandardMaterial color={styleProfile.accent} />
        </mesh>
      )}

      {styleProfile.key === 'shopping' && (
        <mesh position={[x, height + 0.28, z]} rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[0.13, 0.04, 8, 20]} />
          <meshStandardMaterial color={styleProfile.accent} emissive={styleProfile.accent} emissiveIntensity={0.45} />
        </mesh>
      )}

      {styleProfile.key === 'fun' && (
        <>
          <mesh position={[x - 0.12, height + 0.25, z]}>
            <sphereGeometry args={[0.06, 10, 10]} />
            <meshStandardMaterial color={styleProfile.accent} emissive={styleProfile.accent} emissiveIntensity={0.55} />
          </mesh>
          <mesh position={[x + 0.12, height + 0.25, z]}>
            <sphereGeometry args={[0.06, 10, 10]} />
            <meshStandardMaterial color={styleProfile.roof} emissive={styleProfile.roof} emissiveIntensity={0.45} />
          </mesh>
        </>
      )}

      {styleProfile.key === 'health' && (
        <group position={[x, height + 0.28, z]}>
          <mesh>
            <boxGeometry args={[0.22, 0.06, 0.06]} />
            <meshStandardMaterial color={styleProfile.accent} />
          </mesh>
          <mesh>
            <boxGeometry args={[0.06, 0.22, 0.06]} />
            <meshStandardMaterial color={styleProfile.accent} />
          </mesh>
        </group>
      )}

      {(isCardPool || styleProfile.key === 'saving') && (
        <mesh position={[x, height + 0.24, z]}>
          <sphereGeometry args={[0.12, 8, 8]} />
          <meshStandardMaterial
            color={isCardPool ? '#a855f7' : styleProfile.accent}
            emissive={isCardPool ? '#a855f7' : styleProfile.accent}
            emissiveIntensity={0.6}
          />
        </mesh>
      )}

      <mesh ref={outlineRef} position={[x, height / 2, z]} renderOrder={1}>
        <boxGeometry args={[width + 0.12, height + 0.12, width + 0.12]} />
        <meshBasicMaterial color={styleProfile.accent} transparent opacity={0} depthWrite={false} />
      </mesh>

      <Billboard position={[x, height + 0.55, z]}>
        <Text fontSize={0.25} color="#1e293b" anchorX="center" anchorY="middle" outlineWidth={0.04} outlineColor="#ffffff" maxWidth={2}>
          {pool.name.length > 6 ? `${pool.name.slice(0, 6)}…` : pool.name}
        </Text>
      </Billboard>

      {selected && (
        <Billboard position={[x, height + 0.2, z]}>
          <Text fontSize={0.18} color={balance >= 0 ? '#16a34a' : '#dc2626'} anchorX="center" anchorY="middle" outlineWidth={0.03} outlineColor="#ffffff">
            ¥{balance.toLocaleString()}
          </Text>
        </Billboard>
      )}

      <mesh ref={markerRef} position={[x, height + 0.45, z]} visible={selected}>
        <ringGeometry args={[0.15, 0.2, 32]} />
        <meshBasicMaterial color={styleProfile.accent} side={THREE.DoubleSide} transparent opacity={0} />
      </mesh>
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
  const treeRef = useRef<THREE.Group>(null);
  const phase = useMemo(() => (x * 0.41 + z * 0.93) * 0.7, [x, z]);

  useFrame((state) => {
    if (!treeRef.current) return;
    treeRef.current.rotation.z = Math.sin(state.clock.getElapsedTime() * 1.4 + phase) * 0.03;
  });

  return (
    <group ref={treeRef} position={[x, 0, z]}>
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
        <Text fontSize={0.6} color="#94a3b8" anchorX="center" anchorY="middle">
          暂无资金池
        </Text>
      </Billboard>
      <Text position={[0, 0.8, 0]} fontSize={0.25} color="#94a3b8" anchorX="center" anchorY="middle">
        创建资金池后，这里会生成你的城市建筑
      </Text>
    </group>
  );
}

export default function PoolCity() {
  const { pools, transactions } = useStore();
  const [selectedId, setSelectedId] = React.useState<string | null>(null);

  const handleSelect = React.useCallback((id: string) => {
    setSelectedId((current) => (current === id ? null : id));
  }, []);

  const filteredPools = pools;
  const selectedPool = filteredPools.find((pool) => pool.id === selectedId) || null;

  const poolStyles = useMemo(
    () => new Map(filteredPools.map((pool) => [pool.id, derivePoolStyle(pool, transactions)])),
    [filteredPools, transactions]
  );

  const selectedPoolStyle = selectedPool ? poolStyles.get(selectedPool.id) ?? STYLE_PROFILES.mixed : null;

  const positions = useMemo(
    () => generateBuildingPositions(filteredPools.length || 1, 12, 2.5),
    [filteredPools.length]
  );

  const treePositions = useMemo(() => {
    const rng = mulberry32(20250401 + positions.length * 17);
    const trees: [number, number][] = [];

    for (let index = 0; index < 30; index += 1) {
      const x = (rng() - 0.5) * 14;
      const z = (rng() - 0.5) * 14;
      let valid = true;

      for (const [px, pz] of positions) {
        if (Math.hypot(x - px, z - pz) < 1.2) {
          valid = false;
          break;
        }
      }

      for (const [tx, tz] of trees) {
        if (Math.hypot(x - tx, z - tz) < 0.8) {
          valid = false;
          break;
        }
      }

      if (valid) trees.push([x, z]);
    }

    return trees;
  }, [positions]);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">城市视图</h2>
        <p className="mt-1 text-sm text-gray-500 dark:text-slate-400">
          每个资金池会生成一座建筑。高度代表预算，建筑细节会根据该池子的主要消费性质自动变化。
        </p>
      </div>

      <div className="city-shell animate-city-fade-in relative overflow-hidden rounded-2xl border border-gray-200 bg-gradient-to-b from-sky-100 to-green-50 shadow-lg dark:border-slate-700 dark:from-slate-800 dark:to-slate-900" style={{ height: '65vh' }}>
        <div className="pointer-events-none absolute inset-x-0 top-0 h-28 bg-gradient-to-b from-white/35 to-transparent dark:from-white/5" />
        <div className="city-float-slow pointer-events-none absolute -top-10 left-10 h-24 w-24 rounded-full bg-white/30 blur-2xl" />
        <div className="city-float-delay pointer-events-none absolute right-16 top-12 h-16 w-16 rounded-full bg-sky-200/40 blur-2xl" />

        <Canvas camera={{ position: [8, 10, 8], fov: 50 }} onPointerMissed={() => setSelectedId(null)}>
          <ambientLight intensity={0.6} />
          <directionalLight position={[10, 15, 5]} intensity={0.8} />
          <pointLight position={[-5, 8, -5]} intensity={0.3} color="#fde047" />

          <Ground />

          {filteredPools.map((pool, index) => (
            <Building
              key={pool.id}
              pool={pool}
              position={positions[index]}
              selected={selectedId === pool.id}
              onSelect={handleSelect}
              styleProfile={poolStyles.get(pool.id) ?? STYLE_PROFILES.mixed}
            />
          ))}

          {filteredPools.length === 0 && <EmptyState />}

          {treePositions.slice(0, 25).map((position, index) => (
            <Tree key={index} position={position} />
          ))}

          <OrbitControls enableDamping dampingFactor={0.1} minDistance={3} maxDistance={20} maxPolarAngle={Math.PI / 2.2} target={[0, 0, 0]} />
          <fog attach="fog" args={['#e8f5e9', 15, 30]} />
        </Canvas>

        {filteredPools.length > 0 && (
          <div className="pointer-events-none absolute bottom-4 left-4 right-4 flex flex-wrap justify-center gap-2">
            <div className="animate-city-rise-up pointer-events-auto flex flex-wrap gap-2 rounded-xl bg-white/90 p-2 shadow-lg backdrop-blur-sm dark:bg-slate-800/90">
              {filteredPools.map((pool) => {
                const isOver = pool.budget > 0 && pool.balance < 0;
                const styleProfile = poolStyles.get(pool.id) ?? STYLE_PROFILES.mixed;

                return (
                  <button
                    key={pool.id}
                    onClick={() => handleSelect(pool.id)}
                    className={selectedId === pool.id
                      ? 'flex -translate-y-0.5 items-center gap-1.5 rounded-lg border border-indigo-300 bg-indigo-100 px-3 py-1.5 text-xs font-medium shadow-md ring-1 ring-indigo-400 transition-all duration-200 dark:border-indigo-600 dark:bg-indigo-900/40'
                      : 'flex items-center gap-1.5 rounded-lg bg-white/80 px-3 py-1.5 text-xs transition-all duration-200 hover:-translate-y-0.5 hover:bg-white dark:bg-slate-700/80 dark:hover:bg-slate-600'
                    }
                  >
                    <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: pool.color }} />
                    <span className="max-w-[90px] truncate">{pool.name}</span>
                    <span className="shrink-0 rounded-full px-1.5 py-0.5 text-[9px]" style={{ backgroundColor: `${styleProfile.accent}20`, color: styleProfile.accent }}>
                      {styleProfile.label}
                    </span>
                    {!!pool.isCardPool && <span className="shrink-0 text-[9px] text-purple-500">卡池</span>}
                    <span className={isOver ? 'shrink-0 text-red-500' : 'shrink-0 text-gray-500 dark:text-slate-400'}>
                      ¥{pool.balance >= 0 ? pool.balance.toLocaleString() : '0'}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {selectedPool && selectedPoolStyle && (
          <div className="animate-city-pop-in absolute right-4 top-4 w-72 rounded-2xl border border-indigo-200 bg-white/95 p-5 shadow-2xl backdrop-blur-md dark:border-indigo-700 dark:bg-slate-800/95">
            <div className="mb-3 flex items-center justify-between">
              <div className="min-w-0 flex items-center gap-2">
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg" style={{ background: `${selectedPool.color}20` }}>
                  <div className="h-3 w-3 rounded-full" style={{ backgroundColor: selectedPool.color }} />
                </div>
                <div className="min-w-0">
                  <h3 className="flex items-center gap-1.5 truncate text-sm font-semibold">
                    {selectedPool.name}
                    {!!selectedPool.isCardPool && (
                      <span className="flex shrink-0 items-center gap-0.5 rounded-full bg-purple-100 px-1.5 py-0.5 text-[9px] text-purple-600 dark:bg-purple-900/40 dark:text-purple-400">
                        <CreditCard size={9} /> 卡池
                      </span>
                    )}
                  </h3>
                  <p className="mt-1 text-[11px]" style={{ color: selectedPoolStyle.accent }}>
                    {selectedPoolStyle.label}
                  </p>
                </div>
              </div>
              <button onClick={() => setSelectedId(null)} className="shrink-0 rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-slate-700 dark:hover:text-gray-200">
                <X size={16} />
              </button>
            </div>

            <div className="mb-3 rounded-xl border px-3 py-2 text-xs" style={{ borderColor: `${selectedPoolStyle.accent}40`, backgroundColor: `${selectedPoolStyle.accent}10`, color: selectedPoolStyle.accent }}>
              建筑主题：{selectedPoolStyle.description}
            </div>

            <div className="mb-3 grid grid-cols-2 gap-2">
              <div className="rounded-xl bg-gray-50 p-3 dark:bg-slate-700/50">
                <p className="mb-0.5 text-[10px] text-gray-400 dark:text-slate-500">余额</p>
                <p className={selectedPool.balance < 0 ? 'text-base font-bold text-red-500' : 'text-base font-bold text-gray-900 dark:text-slate-100'}>
                  ¥{selectedPool.balance.toLocaleString('zh-CN', { minimumFractionDigits: 2 })}
                </p>
              </div>
              <div className="rounded-xl bg-gray-50 p-3 dark:bg-slate-700/50">
                <p className="mb-0.5 text-[10px] text-gray-400 dark:text-slate-500">预算</p>
                <p className="text-base font-bold text-gray-900 dark:text-slate-100">
                  ¥{selectedPool.budget.toLocaleString('zh-CN', { minimumFractionDigits: 2 })}
                </p>
              </div>
            </div>

            <div className="h-2 overflow-hidden rounded-full bg-gray-200 dark:bg-slate-700">
              <div
                className="h-full rounded-full transition-all"
                style={{
                  width: `${Math.min(100, Math.max(0, (Math.max(0, selectedPool.balance) / Math.max(1, selectedPool.budget)) * 100))}%`,
                  background: selectedPool.balance < 0 ? '#ef4444' : selectedPool.balance > selectedPool.budget ? '#f59e0b' : selectedPool.color,
                }}
              />
            </div>
            <p className="mt-1.5 text-center text-[10px] text-gray-400">
              {selectedPool.budget > 0
                ? `预算剩余占比 ${Math.round((Math.max(0, selectedPool.balance) / selectedPool.budget) * 100)}%`
                : '未设置预算'}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
