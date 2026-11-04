/**
 * Жёсткое обновление страницы: сбрасывает кэши и перезагружает приложение по
 * новому URL.
 *
 * Зачем: iOS Safari и ярлыки на домашнем экране держат старый HTML и старые
 * чанки Next.js, поэтому после деплоя игрок продолжает видеть прошлую версию.
 * Смена URL (`?_=…`) заставляет браузер заново запросить HTML, а вместе с ним —
 * актуальные ссылки на скрипты.
 */
export async function hardRefresh(): Promise<void> {
  try {
    if (typeof caches !== 'undefined') {
      const keys = await caches.keys();
      await Promise.all(keys.map((key) => caches.delete(key)));
    }
    if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.all(registrations.map((registration) => registration.unregister()));
    }
  } catch {
    // не смогли почистить — всё равно перезагружаемся по новому URL
  }

  const url = new URL(window.location.href);
  url.searchParams.set('_', String(Date.now()));
  window.location.replace(url.toString());
}
