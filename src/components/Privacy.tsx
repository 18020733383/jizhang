import React, { ReactNode } from 'react';
import { cn } from '../lib/utils';
import { Lock } from 'lucide-react';

interface BlurOverlayProps {
  children: ReactNode;
  isBlurred: boolean;
  className?: string;
  blurredClassName?: string;
  fallbackContent?: ReactNode;
}

export function BlurOverlay({ 
  children, 
  isBlurred, 
  className,
  blurredClassName = "blur-sm select-none",
  fallbackContent
}: BlurOverlayProps) {
  return (
    <div className={cn(isBlurred && blurredClassName, className)}>
      {isBlurred && fallbackContent && (
        <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-r from-transparent via-white/50 to-transparent dark:via-slate-900/50 pointer-events-none">
          <div className="flex items-center gap-2 text-gray-400 bg-white/80 dark:bg-slate-800/80 px-4 py-2 rounded-full backdrop-blur-sm">
            <Lock size={16} />
            <span className="text-sm">隐私内容</span>
          </div>
        </div>
      )}
      {children}
    </div>
  );
}

export function PrivacyBadge({ 
  level, 
  onChange,
  disabled = false
}: { 
  level: number;
  onChange?: (level: number) => void;
  disabled?: boolean;
}) {
  const levelNames = ['Lv1', 'Lv2', 'Lv3'];
  const levelColors = ['bg-gray-100 text-gray-600', 'bg-blue-100 text-blue-600', 'bg-amber-100 text-amber-600'];
  
  if (disabled) {
    return (
      <span className={cn(
        "px-2 py-0.5 rounded-full text-xs font-medium",
        levelColors[level - 1]
      )}>
        {levelNames[level - 1]}
      </span>
    );
  }
  
  return (
    <select
      value={level}
      onChange={(e) => onChange?.(Number(e.target.value))}
      className={cn(
        "px-2 py-0.5 rounded-full text-xs font-medium border-0 cursor-pointer",
        levelColors[level - 1]
      )}
    >
      <option value={1}>Lv1</option>
      <option value={2}>Lv2</option>
      <option value={3}>Lv3</option>
    </select>
  );
}
