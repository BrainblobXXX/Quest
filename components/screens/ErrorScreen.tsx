'use client';

import type { ParseProblem } from '@/lib/types';

export default function ErrorScreen({
  message,
  problems = [],
  onBack,
}: {
  message: string;
  problems?: ParseProblem[];
  onBack: () => void;
}) {
  return (
    <div>
      <h1 className="screen-heading error">ОШИБКА ЧТЕНИЯ ДИСКА</h1>
      <div className="error" style={{ whiteSpace: 'pre-wrap', marginBottom: 16 }}>
        {message}
      </div>
      {problems.length > 0 && (
        <ul className="parse-problems" style={{ marginBottom: 16 }}>
          {problems.slice(0, 20).map((problem, index) => (
            <li key={`${problem.code}-${index}`}>
              <span className="parse-code">{problem.code}</span>
              {problem.scene ? ` [${problem.scene}]` : ''} {problem.message}
            </li>
          ))}
        </ul>
      )}
      <button className="list-item" onClick={onBack}>
        1. В БИБЛИОТЕКУ
      </button>
    </div>
  );
}
