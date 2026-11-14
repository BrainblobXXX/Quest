/**
 * Предзагрузка боевых изображений.
 *
 * Первый бой на устройстве может подвисать, потому что браузер одновременно
 * скачивает и декодирует PNG-кадры. Держим промисы в памяти и ждём `decode()`
 * до старта анимации; повторные вызовы бесплатны.
 */
const imageCache = new Map<string, Promise<void>>();
const MAX_IMAGE_CACHE = 80;

export function preloadImage(src: string): Promise<void> {
  if (typeof window === 'undefined' || !src) return Promise.resolve();
  const existing = imageCache.get(src);
  if (existing) return existing;

  const promise = new Promise<void>((resolve) => {
    const image = new window.Image();
    image.decoding = 'async';

    let settled = false;
    const done = () => {
      if (settled) return;
      settled = true;
      resolve();
    };

    // onerror тоже резолвит: отсутствующий кадр не должен блокировать бой.
    image.onload = done;
    image.onerror = done;
    image.src = src;

    if (typeof image.decode === 'function') {
      void image.decode().then(done, done);
    } else {
      window.setTimeout(done, 1200);
    }
    // Страховка от зависшего запроса: бой важнее идеальной загрузки.
    window.setTimeout(done, 4000);
  });

  imageCache.set(src, promise);
  while (imageCache.size > MAX_IMAGE_CACHE) {
    const oldest = imageCache.keys().next().value;
    if (!oldest) break;
    imageCache.delete(oldest);
  }
  return promise;
}

export function preloadImages(sources: readonly string[]): Promise<void> {
  return Promise.all(sources.map((src) => preloadImage(src))).then(() => undefined);
}

/** Сбросить память предзагрузки при запуске другой книги. */
export function clearPreloadCache(): void {
  imageCache.clear();
}
