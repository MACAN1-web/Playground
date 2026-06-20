import { useEffect, useState } from "react";
import { api } from "./api";
import type { Applicant, Direction, SearchResult } from "./types";

const formatDate = (value: string | null) => {
  if (!value) return "ещё не опубликован";
  const date = new Date(value);
  const part = (number: number) => String(number).padStart(2, "0");
  return `${part(date.getDate())}.${part(date.getMonth() + 1)}.${date.getFullYear()} ${part(date.getHours())}:${part(date.getMinutes())}`;
};

const formatStudyFormWithPlaces = (item: { study_form: string; budget_places: number | null; paid_places: number | null }) => {
  const parts = [item.study_form];
  if (typeof item.budget_places === "number") parts.push(`бюджет: ${item.budget_places}`);
  if (typeof item.paid_places === "number") parts.push(`внебюджет: ${item.paid_places}`);
  return parts.join(" · ");
};

const keepScrollPosition = async (callback: () => Promise<void>) => {
  const scrollX = window.scrollX;
  const scrollY = window.scrollY;
  await callback();
  window.requestAnimationFrame(() => {
    window.requestAnimationFrame(() => window.scrollTo(scrollX, scrollY));
  });
};

const splitSpecialty = (specialty: string) => {
  const match = specialty.match(/^(\d{2}\.\d{2}\.\d{2})\s+(.+)$/);
  if (!match) return { code: "", title: specialty };
  return { code: match[1], title: match[2] };
};

function SearchTab() {
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

function ListsTab({ directions }: { directions: Direction[] }) {
  const [selected, setSelected] = useState<number | null>(directions[0]?.id ?? null);
  const [applicants, setApplicants] = useState<Applicant[]>([]);
  const [manuallyClosed, setManuallyClosed] = useState(false);
  const direction = directions.find((item) => item.id === selected);

  useEffect(() => {
    if (selected === null && directions.length && !manuallyClosed) setSelected(directions[0].id);
  }, [directions, selected, manuallyClosed]);

  useEffect(() => {
    if (!selected) return;
    api.get<{ applicants: Applicant[] }>(`/api/directions/${selected}/applicants`).then((data) => setApplicants(data.applicants));
  }, [selected]);

  const applicantsPanel = direction ? <div className="table-panel">
    <p className="eyebrow">{formatStudyFormWithPlaces(direction)}</p>
    <h2>{direction.specialty}</h2>
    <div className="meta"><span>Обновлено: {formatDate(direction.updated_at)}</span></div>
    <div className="table-wrap"><table>
      <thead><tr><th>Место</th><th className="snils-cell">СНИЛС</th><th className="score-cell">Средний балл</th><th>Оригинал</th></tr></thead>
      <tbody>{applicants.map((item) => <tr key={`${item.position}-${item.snils}`}><td><strong>{item.position}</strong></td><td className="snils-cell">{item.snils}</td><td className="score-cell">{item.averageScore}</td><td><span className={item.originalProvided ? "original-mark active" : "original-mark"} title={item.originalProvided ? "Оригинал принесён" : "Оригинал не принесён"}>{item.originalProvided ? "✓" : "×"}</span></td></tr>)}</tbody>
    </table></div>
  </div> : <div className="table-panel"><p>Выберите направление.</p></div>;

  return <section className="list-layout">
    <aside className="direction-list">
      <h2>Направления</h2>
      {!directions.length && <p className="muted">Списки пока не опубликованы.</p>}
      {directions.map((item) => <div className="direction-block" key={item.id}>
        <button className={selected === item.id ? "direction active" : "direction"} title={`${item.specialty} · ${formatStudyFormWithPlaces(item)}`} onClick={() => {
          if (selected === item.id) {
            setSelected(null);
            setManuallyClosed(true);
          } else {
            setSelected(item.id);
            setManuallyClosed(false);
          }
        }}>
          <strong>{item.specialty}</strong><span>{formatStudyFormWithPlaces(item)}</span>
        </button>
        {selected === item.id && <div className="mobile-inline-panel">{applicantsPanel}</div>}
      </div>)}
    </aside>
    <div className="desktop-list-panel">{applicantsPanel}</div>
  </section>;
}

export default function App() {
  const [tab, setTab] = useState<"search" | "lists">("search");
  const [directions, setDirections] = useState<Direction[]>([]);
  const [loadError, setLoadError] = useState("");
  const refresh = () =>
    api.get<Direction[]>("/api/directions")
      .then((data) => {
        setDirections(data);
        setLoadError("");
      })
      .catch(() => setLoadError("Не удалось подключиться к серверу. Проверьте, что backend запущен."));

  useEffect(() => { void refresh(); }, []);

  useEffect(() => {
    const events = api.eventSource("/api/events");
    events.addEventListener("ratings-changed", () => { void keepScrollPosition(refresh); });
    return () => events.close();
  }, []);

  return <><header><div className="brand"><div className="logo">К</div><div><strong>Приёмная комиссия</strong><span>Рейтинги абитуриентов</span></div></div><nav>
    <button className={tab === "search" ? "active" : ""} onClick={() => setTab("search")}>Найти себя</button>
    <button className={tab === "lists" ? "active" : ""} onClick={() => setTab("lists")}>Списки поступающих</button>
  </nav></header><main>{loadError && <p className="error-banner">{loadError}</p>}{tab === "search" ? <SearchTab /> : <ListsTab directions={directions} />}</main></>;
}
