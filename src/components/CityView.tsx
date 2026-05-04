import React, { useMemo, useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Text, Float, Grid } from '@react-three/drei';
import * as THREE from 'three';
import { useStore, Pool } from '../store/useStore';
import { cn } from '../lib/utils';

interface BuildingData {
  pool: Pool;
  x: number;
  z: number;
  height: number;
  color: THREE.Color;
  emissive: THREE.Color;
}

function Building({ data, index }: { data: BuildingData; index: number }) {
  const meshRef = useRef<THREE.Mesh>(null);
  const { pool, x, z, height, color, emissive } = data;
  const isCardPool = !!pool.isCardPool;
  const w = isCardPool ? 1.4 : 1.0;
  const d = isCardPool ? 1.4 : 1.0;

  // Gentle floating animation
  useFrame((state) => {
    if (meshRef.current) {
      meshRef.current.position.y = Math.sin(state.clock.elapsedTime * 0.8 + index * 0.5) * 0.03;
    }
  });

  return (
    <group position={[x, 0, z]}>
      {/* Base platform */}
      <mesh position={[0, 0.05, 0]} receiveShadow castShadow>
        <boxGeometry args={[w + 0.3, 0.1, d + 0.3]} />
        <meshStandardMaterial color="#2d2d3d" roughness={0.4} metalness={0.3} />
      </mesh>

      {/* Main building */}
      <mesh ref={meshRef} position={[0, height / 2 + 0.1, 0]} castShadow receiveShadow>
        <boxGeometry args={[w, height, d]} />
        <meshStandardMaterial
          color={color}
          roughness={0.3}
          metalness={0.5}
          emissive={emissive}
          emissiveIntensity={0.2}
        />
      </mesh>

      {/* Building top accent */}
      <mesh position={[0, height + 0.12, 0]} receiveShadow>
        <boxGeometry args={[w + 0.1, 0.05, d + 0.1]} />
        <meshStandardMaterial color={color} roughness={0.2} metalness={0.7} emissive={emissive} emissiveIntensity={0.4} />
      </mesh>

      {/* Card pool crown */}
      {isCardPool && (
        <Float speed={2} rotationIntensity={0} floatIntensity={0}>
          <mesh position={[0, height + 0.35, 0]}>
            <coneGeometry args={[0.5, 0.4, 4]} />
            <meshStandardMaterial color="#a855f7" roughness={0.2} metalness={0.6} emissive="#7c3aed" emissiveIntensity={0.5} />
          </mesh>
        </Float>
      )}

      {/* Pool name label */}
      <Float speed={2} rotationIntensity={0} floatIntensity={0.05}>
        <Text
          position={[0, height + (isCardPool ? 0.8 : 0.4), 0]}
          fontSize={0.18}
          maxWidth={3}
          textAlign="center"
          color="white"
          anchorX="center"
          anchorY="bottom"
          outlineWidth={0.03}
          outlineColor="#00000080"
        >
          {pool.name}
        </Text>
      </Float>

      {/* Balance indicator */}
      <Text
        position={[0, height + (isCardPool ? 0.55 : 0.22), 0]}
        fontSize={0.12}
        maxWidth={2.5}
        textAlign="center"
        color="#ddd"
        anchorX="center"
        anchorY="bottom"
      >
        ¥{pool.balance.toLocaleString()}
      </Text>
    </group>
  );
}

function CityGround() {
  return (
    <group>
      {/* Grid */}
      <Grid
        position={[0, 0.01, 0]}
        args={[20, 20]}
        cellSize={1}
        cellThickness={0.5}
        cellColor="#2d2d3d"
        sectionSize={4}
        sectionThickness={1}
        sectionColor="#3d3d5e"
        fadeDistance={50}
        infiniteGrid
      />

      {/* Ground plane */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, 0]} receiveShadow>
        <planeGeometry args={[50, 50]} />
        <meshStandardMaterial color="#1a1a2e" roughness={0.8} />
      </mesh>
    </group>
  );
}

function ParticleRing() {
  const count = 100;
  const positions = useMemo(() => {
    const pos = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2;
      const r = 8 + Math.random() * 2;
      pos[i * 3] = Math.cos(angle) * r;
      pos[i * 3 + 1] = 0.1 + Math.random() * 0.5;
      pos[i * 3 + 2] = Math.sin(angle) * r;
    }
    return pos;
  }, []);

  return (
    <points>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          count={count}
          array={positions}
          itemSize={3}
        />
      </bufferGeometry>
      <pointsMaterial size={0.04} color="#646cff" opacity={0.4} transparent />
    </points>
  );
}

function CityBuildings({ pools }: { pools: Pool[] }) {
  const buildingData = useMemo(() => {
    const maxBudget = Math.max(1, ...pools.map(p => p.budget));
    const cols = Math.ceil(Math.sqrt(pools.length));
    const spacing = 2.5;

    return pools.map((pool, i) => {
      const row = Math.floor(i / cols);
      const col = i % cols;
      const x = (col - (cols - 1) / 2) * spacing;
      const z = (row - Math.floor((pools.length - 1) / cols) / 2) * spacing + 3;

      const rawHeight = maxBudget > 0 ? (pool.budget / maxBudget) * 6 : 1;
      const height = Math.max(1, rawHeight);
      const isCardPool = !!pool.isCardPool;

      // Color: use pool color, or fallback to balance-based
      const poolColor = new THREE.Color(pool.color || '#4f46e5');
      const emissiveColor = isCardPool
        ? new THREE.Color('#7c3aed')
        : poolColor.clone().multiplyScalar(0.3);

      return { pool, x, z, height, color: poolColor, emissive: emissiveColor };
    });
  }, [pools]);

  return (
    <group>
      {buildingData.map((data, i) => (
        <Building key={data.pool.id} data={data} index={i} />
      ))}
    </group>
  );
}

export default function CityView() {
  const { pools, transactions, ready } = useStore();

  if (!ready) {
    return (
      <div className="h-[calc(100vh-8rem)] flex items-center justify-center bg-gray-50 dark:bg-slate-950">
        <div className="text-gray-400">加载中...</div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {/* Info bar */}
      <div className="flex items-center justify-between px-4">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <span className="text-xl">🏙️</span> 城市视图
        </h2>
        <div className="flex items-center gap-4 text-xs text-gray-500 dark:text-slate-400">
          <span>🖱️ 拖拽旋转</span>
          <span>🖱️ 滚轮缩放</span>
          <span>🖱️ 右键平移</span>
          <span>共 {pools.length} 座建筑</span>
        </div>
      </div>

      {/* 3D Canvas */}
      <div className="h-[calc(100vh-10rem)] rounded-2xl overflow-hidden border border-gray-200 dark:border-slate-700 bg-gradient-to-b from-[#0f0f23] to-[#1a1a2e]">
        <Canvas
          shadows
          camera={{ position: [10, 8, 10], fov: 45, near: 0.1, far: 100 }}
          gl={{ antialias: true, toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1.2 }}
        >
          {/* Lighting */}
          <ambientLight intensity={0.4} />
          <directionalLight
            position={[15, 20, 10]}
            intensity={0.8}
            castShadow
            shadow-mapSize-width={1024}
            shadow-mapSize-height={1024}
            shadow-camera-far={50}
            shadow-camera-left={-15}
            shadow-camera-right={15}
            shadow-camera-top={15}
            shadow-camera-bottom={-15}
          />
          <pointLight position={[-5, 5, -5]} intensity={0.3} color="#6366f1" />
          <pointLight position={[5, 3, -5]} intensity={0.2} color="#a855f7" />

          {/* Scene objects */}
          <CityGround />
          <ParticleRing />
          <CityBuildings pools={pools} />

          {/* Controls */}
          <OrbitControls
            enableDamping
            dampingFactor={0.05}
            minDistance={5}
            maxDistance={25}
            maxPolarAngle={Math.PI / 2.5}
            target={[0, 2, 3]}
          />

          {/* Fog for atmosphere */}
          <fog attach="fog" args={['#0f0f23', 15, 35]} />
        </Canvas>
      </div>
    </div>
  );
}
