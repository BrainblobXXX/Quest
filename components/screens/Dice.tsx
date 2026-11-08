/**
 * Общая грань кубика.
 *
 * - d2 (монетка) рисуется отдельно в GameScreen;
 * - значения d6 — точками;
 * - d7…d20 — силуэтом d20 с числом.
 */
const DIE_PIPS: Record<number, number[]> = {
  1: [5],
  2: [1, 9],
  3: [1, 5, 9],
  4: [1, 3, 7, 9],
  5: [1, 3, 5, 7, 9],
  6: [1, 3, 4, 6, 7, 9],
};

export function DieFace({
  value,
  sides = 6,
  className = 'combat-die-face',
  numberClassName = 'die-number',
}: {
  value: number;
  /** максимальное значение кубика: ≤6 — d6, >6 — d20 */
  sides?: number;
  className?: string;
  numberClassName?: string;
}) {
  if (sides > 6) {
    return (
      <span
        className={`${className} die-shape die-d20 ${numberClassName}`}
        role="img"
        aria-label={`d20: ${value}`}
      >
        <span className="die-value">{value}</span>
      </span>
    );
  }

  const active = DIE_PIPS[value] ?? [];
  return (
    <span className={className} role="img" aria-label={`d6: ${value}`}>
      {Array.from({ length: 9 }, (_, index) => (
        <span key={index} className={`combat-die-pip${active.includes(index + 1) ? ' on' : ''}`} />
      ))}
    </span>
  );
}
