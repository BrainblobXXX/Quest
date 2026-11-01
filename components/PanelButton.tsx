'use client';

export function PanelButton({
  label,
  latched,
  disabled,
  onClick,
}: {
  label: string;
  latched?: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={`panel-btn${latched ? ' latched' : ''}`}
      aria-pressed={Boolean(latched)}
      disabled={disabled}
      onClick={onClick}
    >
      <span className="btn-row">
        <span className="btn-led" />
        {label}
      </span>
    </button>
  );
}
