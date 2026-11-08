'use client';

import { useEffect, useRef } from 'react';

type KeyHandler = (event: KeyboardEvent) => boolean;

/**
 * Единый keyboard-слой интерактивных панелей.
 *
 * Слушатель стоит в capture-фазе и перехватывает событие раньше общей
 * клавиатуры GameScreen. Обработчик возвращает true, если событие обработано;
 * в этом случае панель сама гасит его, чтобы сцена не сработала повторно.
 *
 * Обработчик хранится в ref: свежий state-замыкание всегда доступно, а
 * слушатель регистрируется один раз.
 */
export function usePanelKeys(handler: KeyHandler): void {
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!handlerRef.current(event)) return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, []);
}
