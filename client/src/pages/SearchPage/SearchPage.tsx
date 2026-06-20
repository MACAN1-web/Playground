import { useState } from "react";
import { api } from "../../shared/api/client";
import type { SearchResult } from "../../shared/types/rating";
import { formatDate, formatStudyFormWithPlaces, splitSpecialty } from "../../shared/lib/format";

export function SearchPage() {
  const [snils, setSnils] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [message, setMessage] = useState("");

  async function search(event: React.FormEvent) {
    event.preventDefault();
    setMessage("");
    try {
      const found = await api.post<SearchResult[]>("/api/search", { snils });
      setResults(found);
      if (!found.length) setMessage("Абитуриент с таким СНИЛС не найден в опубликованных списках.");
    } catch (error) {
      setResults([]);
      setMessage((error as Error).message);
    }
  }

  return <section>
    <div className="hero-card">
      <p className="eyebrow">Поиск по всем направлениям</p>
      <h2>Найдите себя в рейтингах</h2>
      <p>Введите номер СНИЛС</p>
      <form className="search" onSubmit={search}>
        <input value={snils} onChange={(event) => setSnils(event.target.value.replace(/\D/g, "").slice(0, 11))} placeholder="11 цифр СНИЛС" />
        <button>Найти</button>
      </form>
      {message && <p className="message">{message}</p>}
    </div>
    <div className="cards">
      {results.map((result) => {
        const specialty = splitSpecialty(result.specialty);
        return <article className="result-card" key={result.direction_id}>
          <div><span className="badge">{formatStudyFormWithPlaces(result)}</span></div>
          <h3>{specialty.code ? <><span className="specialty-code">{specialty.code}</span><span className="specialty-title">{specialty.title}</span></> : specialty.title}</h3>
          <div className="result-card-footer">
            <div className="result-meta">
              <span className="muted">Обновлено: {formatDate(result.updated_at)}</span>
              <span className={result.originalProvided ? "badge original-status active" : "badge original-status"}>{result.originalProvided ? "✓ Оригинал принесён" : "× Оригинал не принесён"}</span>
            </div>
            <div className="stats">
              <div><strong>#{result.position}</strong><span>место</span></div>
              <div><strong>{result.average_score}</strong><span>средний балл</span></div>
            </div>
          </div>
        </article>;
      })}
    </div>
  </section>;
}
