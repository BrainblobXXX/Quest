'use client';

export default function ErrorScreen({ message, onBack }: { message: string; onBack: () => void }) {
  return (
    <div>
      <h1 className="screen-heading error">ОШИБКА ЧТЕНИЯ ДИСКА</h1>
      <div className="error" style={{ whiteSpace: 'pre-wrap', marginBottom: 16 }}>
        {message}
      </div>
      <button className="list-item" onClick={onBack}>
        1. В БИБЛИОТЕКУ
      </button>
    </div>
  );
}
