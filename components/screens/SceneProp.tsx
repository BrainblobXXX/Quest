/**
 * Предмет обстановки/эффект сцены.
 *
 * Это не иллюстрация сцены: прозрачный prop показывается под текстом и над
 * блоком «найдено/потеряно». Фон и рамка не рисуются — только изображение
 * с фильтром, близким к боевым спрайтам.
 */
export default function SceneProp({ src, alt }: { src: string; alt?: string }) {
  return (
    <figure className="scene-prop">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt={alt ?? ''} draggable={false} decoding="async" />
    </figure>
  );
}
