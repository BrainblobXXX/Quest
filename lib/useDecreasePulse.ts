'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * Короткий импульс плашки при уменьшении значения.
 * Если значение стало 0, анимация не запускается: это уже не уменьшение
 * счётчика, а смерть/переход к следующей цели.
 */
export function useDecreasePulse(value: number, duration = 280): boolean {
  const previous = useRef(value);
  const [pulse, setPulse] = useState(false);

  useEffect(() => {
    const before = previous.current;
    previous.current = value;
    if (!(value < before && value > 0)) return;

    setPulse(true);
    const timer = window.setTimeout(() => setPulse(false), duration);
    return () => window.clearTimeout(timer);
  }, [value, duration]);

  return pulse;
}
