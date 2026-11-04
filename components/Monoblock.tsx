'use client';

import type { ReactNode } from 'react';
import { PanelButton } from './PanelButton';

export type ScreenName = 'boot' | 'library' | 'game' | 'error';

export default function Monoblock({
  screen,
  gameAvailable,
  children,
  onLibrary,
  onGame,
  onPower,
}: {
  screen: ScreenName;
  gameAvailable: boolean;
  children: ReactNode;
  onLibrary: () => void;
  onGame: () => void;
  onPower: () => void;
}) {
  return (
    <div className="device crt-on">
      {/* монитор */}
      <div className="monitor">
        <div className="monitor-bezel">
          <div className="screen">
            <div className="screen-content">{children}</div>
          </div>

          <div className="monitor-controls">
            <span className="mini-btn" aria-hidden="true" />
            <span className="mini-btn" aria-hidden="true" />
            <span className="mini-btn" aria-hidden="true" />
            <span className="mini-btn" aria-hidden="true" />
            <span className="monitor-led" aria-hidden="true" />
            <span className="monitor-brand">QUEST-166</span>
          </div>
        </div>
      </div>

      {/* системный блок */}
      <div className="case">
        <div className="case-front">
          <div className="case-power">
            <div className="power-stack">
              <button
                className="power-btn"
                onClick={onPower}
                disabled={!gameAvailable}
                aria-label="Перезапустить игру"
                title="Перезапустить игру"
              >
                <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false">
                  <path
                    d="M12 2.8v9.4"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.2"
                    strokeLinecap="round"
                  />
                  <path
                    d="M6.4 6.6a8.2 8.2 0 1 0 11.2 0"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.2"
                    strokeLinecap="round"
                  />
                </svg>
              </button>
              <span className="power-label">POWER</span>
            </div>
            <span className="leds" aria-hidden="true">
              <i className="led pwr" />
              <i className="led hdd" />
            </span>
          </div>

          <div className="drives" aria-hidden="true">
            <div className="drive floppy">
              <span className="drive-slot" />
              <span className="drive-eject" />
            </div>
            <div className="drive cdrom">
              <span className="drive-tray" />
              <span className="drive-eject" />
            </div>
          </div>

          <div className="case-vents" aria-hidden="true" />

          <div className="case-nav">
            <PanelButton label="Движок" latched={screen === 'library'} onClick={onLibrary} />
            <PanelButton
              label="Игра"
              latched={screen === 'game'}
              disabled={!gameAvailable}
              onClick={onGame}
            />
          </div>
        </div>
        <div className="case-plate" aria-hidden="true">
          <span>QUEST-166 · FDD 1.44M · CD-ROM 4×</span>
          <span>MODEL Q-166 · 166 MHz</span>
        </div>
      </div>
    </div>
  );
}
