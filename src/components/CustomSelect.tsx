import React, { useState, useRef, useEffect } from 'react';
import { cn } from '../lib/utils';
import { ChevronDown } from 'lucide-react';

interface Option {
  value: string;
  label: string;
  color?: string;
}

interface Props {
  value: string;
  onChange: (value: string) => void;
  options: Option[];
  placeholder?: string;
  className?: string;
  icon?: React.ReactNode;
  iconColor?: string;
}

export default function CustomSelect({
  value,
  onChange,
  options,
  placeholder = '请选择',
  className,
  icon,
  iconColor,
}: Props) {
  const [isOpen, setIsOpen] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const selectedOption = options.find(o => o.value === value);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div ref={ref} className={cn('relative group', className)}>
      <div
        className={cn(
          'flex items-center gap-2 px-4 py-2.5 rounded-xl border-2 transition-all duration-300 cursor-pointer',
          'bg-white dark:bg-slate-800',
          isOpen
            ? 'border-blue-500 dark:border-blue-400 shadow-md'
            : 'border-gray-200 dark:border-slate-700',
          isHovered && !isOpen ? 'border-blue-400 dark:group-hover:border-blue-500' : '',
          'shadow-sm hover:shadow-md'
        )}
        onClick={() => setIsOpen(!isOpen)}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        {icon && (
          <div
            className="w-3 h-3 rounded-full"
            style={{
              backgroundColor: iconColor || (selectedOption?.color || '#94a3b8'),
            }}
          />
        )}
        {!icon && iconColor === undefined && (
          <span className="text-blue-500 dark:text-blue-400">{icon}</span>
        )}
        <span className="text-sm font-medium text-gray-700 dark:text-slate-200 flex-1">
          {selectedOption?.label || placeholder}
        </span>
        <ChevronDown
          size={16}
          className={cn(
            'text-gray-400 transition-transform duration-200',
            isOpen ? 'rotate-180' : ''
          )}
        />
      </div>

      {/* 下拉选项列表 */}
      {isOpen && (
        <div
          className={cn(
            'absolute z-50 mt-2 w-full rounded-xl border-2 overflow-hidden',
            'bg-white dark:bg-slate-800',
            'border-gray-200 dark:border-slate-700',
            'shadow-lg max-h-60 overflow-y-auto'
          )}
        >
          {options.map((option) => (
            <div
              key={option.value}
              className={cn(
                'flex items-center gap-2 px-4 py-2.5 cursor-pointer transition-colors',
                'hover:bg-blue-50 dark:hover:bg-blue-900/40',
                option.value === value
                  ? 'bg-blue-50 dark:bg-blue-900/60 text-blue-600 dark:text-blue-300'
                  : 'text-gray-700 dark:text-slate-200'
              )}
              onClick={() => {
                onChange(option.value);
                setIsOpen(false);
              }}
            >
              {option.color && (
                <div
                  className="w-3 h-3 rounded-full"
                  style={{ backgroundColor: option.color }}
                />
              )}
              <span className="text-sm font-medium">{option.label}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}