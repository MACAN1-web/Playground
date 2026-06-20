import { useEffect, useState } from "react";
import { api, configureAuthToken } from "./api";
import type { AdminApplicant, AdminDirectionApplicant, Applicant, Direction, SearchResult } from "./types";

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

const placesPayload = (value: string) => value.trim() === "" ? null : Number(value);

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
    <div className="meta">
      <span>Обновлено: {formatDate(direction.updated_at)}</span>
    </div>
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

function Admin({ directions, refresh }: { directions: Direction[]; refresh: () => void }) {
  const [token, setToken] = useState(sessionStorage.getItem("admin-access-token") || "");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [adminQuery, setAdminQuery] = useState("");
  const [adminApplicants, setAdminApplicants] = useState<AdminApplicant[]>([]);
  const [expandedDirectionId, setExpandedDirectionId] = useState<number | null>(null);
  const [directionApplicants, setDirectionApplicants] = useState<AdminDirectionApplicant[]>([]);
  const [placeDrafts, setPlaceDrafts] = useState<Record<number, { budgetPlaces: string; paidPlaces: string }>>({});
  const [placeStatuses, setPlaceStatuses] = useState<Record<number, { budgetPlaces?: string; paidPlaces?: string }>>({});
  const [adminRatingsView, setAdminRatingsView] = useState<"ratings" | "applicants">("ratings");

  useEffect(() => {
    configureAuthToken(
      () => sessionStorage.getItem("admin-access-token") || token,
      (newToken) => {
        sessionStorage.setItem("admin-access-token", newToken);
        setToken(newToken);
      }
    );
  }, [token]);

  useEffect(() => {
    setPlaceDrafts(Object.fromEntries(directions.map((item) => [
      item.id,
      {
        budgetPlaces: item.budget_places === null ? "" : String(item.budget_places),
        paidPlaces: item.paid_places === null ? "" : String(item.paid_places)
      }
    ])));
  }, [directions]);

  useEffect(() => {
    if (!token) return;
    const changedDirections = directions.flatMap((item) => {
      const draft = placeDrafts[item.id];
      if (!draft) return [];
      const budgetPlaces = item.budget_places === null ? "" : String(item.budget_places);
      const paidPlaces = item.paid_places === null ? "" : String(item.paid_places);
      const changedFields = {
        budgetPlaces: draft.budgetPlaces !== budgetPlaces,
        paidPlaces: draft.paidPlaces !== paidPlaces
      };
      return changedFields.budgetPlaces || changedFields.paidPlaces ? [{ item, changedFields }] : [];
    });
    if (!changedDirections.length) return;

    const timeout = window.setTimeout(() => {
      void Promise.all(changedDirections.map(({ item, changedFields }) => {
        const draft = placeDrafts[item.id] ?? { budgetPlaces: "", paidPlaces: "" };
        return api.patch(`/api/admin/directions/${item.id}/places`, {
          budgetPlaces: placesPayload(draft.budgetPlaces),
          paidPlaces: placesPayload(draft.paidPlaces)
        }).then(() => ({ id: item.id, changedFields }));
      }))
        .then((savedItems) => {
          setPlaceStatuses((current) => {
            const next = { ...current };
            for (const { id, changedFields } of savedItems) {
              next[id] = {
                ...next[id],
                ...(changedFields.budgetPlaces ? { budgetPlaces: "Сохранено" } : {}),
                ...(changedFields.paidPlaces ? { paidPlaces: "Сохранено" } : {})
              };
            }
            return next;
          });
          refresh();
        })
        .catch((error) => setMessage((error as Error).message));
    }, 700);

    return () => window.clearTimeout(timeout);
  }, [directions, placeDrafts, token]);

  async function login(event: React.FormEvent) {
    event.preventDefault();
    try {
      const data = await api.post<{ accessToken: string }>("/api/auth/login", { email, password });
      sessionStorage.setItem("admin-access-token", data.accessToken); setToken(data.accessToken); setMessage("");
    } catch (error) { setMessage((error as Error).message); }
  }

  async function importWorkbook(file: File | undefined) {
    if (!file) return;
    const body = new FormData(); body.append("file", file);
    try {
      const data = await api.upload<{ importedSheets: number; importedApplicants: number; skippedRows: number; mergedDuplicates: number }>("/api/admin/import-workbook", body);
      setMessage(`Опубликовано специальностей: ${data.importedSheets}, абитуриентов: ${data.importedApplicants}. Объединено дублей: ${data.mergedDuplicates}, пропущено строк: ${data.skippedRows}`); refresh();
    } catch (error) { setMessage((error as Error).message); }
  }

  async function removeAllDirections() {
    if (!confirm("Удалить все специальности вместе со всеми рейтингами?")) return;
    try {
      await api.delete("/api/admin/directions", {});
      setExpandedDirectionId(null);
      setDirectionApplicants([]);
      setMessage("Все специальности удалены.");
      refresh();
    } catch (error) { setMessage((error as Error).message); }
  }

  async function exportOriginals(directionId: number) {
    try {
      const { blob, filename } = await api.download(`/api/admin/directions/${directionId}/export-originals`);
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      document.body.append(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      setMessage("");
    } catch (error) { setMessage((error as Error).message); }
  }

  function updatePlaceDraft(directionId: number, field: "budgetPlaces" | "paidPlaces", value: string) {
    setPlaceStatuses((current) => ({ ...current, [directionId]: { ...current[directionId], [field]: "" } }));
    setPlaceDrafts((current) => ({
      ...current,
      [directionId]: { ...(current[directionId] ?? { budgetPlaces: "", paidPlaces: "" }), [field]: value }
    }));
  }

  useEffect(() => {
    if (!token) return;
    const events = api.eventSource("/api/events");
    const syncAdminData = () => {
      void keepScrollPosition(async () => {
        if (adminQuery) await searchAdminApplicants();
        if (expandedDirectionId) await loadDirectionApplicants(expandedDirectionId, true);
      });
    };
    events.addEventListener("ratings-changed", syncAdminData);
    return () => events.close();
  }, [token, adminQuery, expandedDirectionId]);

  async function searchAdminApplicants(event?: React.FormEvent) {
    event?.preventDefault();
    try {
      const data = await api.get<AdminApplicant[]>(`/api/admin/applicants?q=${encodeURIComponent(adminQuery)}`);
      setAdminApplicants(data);
      setMessage(data.length ? "" : "Абитуриенты не найдены.");
    } catch (error) { setMessage((error as Error).message); }
  }

  async function setOriginal(directionId: number, snils: string, originalProvided: boolean) {
    try {
      await api.patch(`/api/admin/applicants/${snils}/original`, { directionId, originalProvided });
      setAdminApplicants((current) => current.map((applicant) => applicant.snilsNormalized === snils
        ? { ...applicant, originalProvided: originalProvided && applicant.directionId === directionId }
        : applicant));
      setDirectionApplicants((current) => current.map((applicant) => applicant.snilsNormalized === snils
        ? { ...applicant, originalProvided: originalProvided && expandedDirectionId === directionId }
        : applicant));
      await keepScrollPosition(async () => {
        if (adminQuery) await searchAdminApplicants();
        if (expandedDirectionId) await loadDirectionApplicants(expandedDirectionId, true);
      });
    } catch (error) { setMessage((error as Error).message); }
  }

  async function setPriorityEnrollment(directionId: number, snils: string, priorityEnrollment: boolean) {
    try {
      await api.patch(`/api/admin/applicants/${snils}/priority`, { directionId, priorityEnrollment });
      setAdminApplicants((current) => current.map((applicant) => applicant.snilsNormalized === snils && applicant.directionId === directionId
        ? { ...applicant, priorityEnrollment }
        : applicant));
      setDirectionApplicants((current) => current.map((applicant) => applicant.snilsNormalized === snils
        ? { ...applicant, priorityEnrollment }
        : applicant));
      await keepScrollPosition(async () => {
        if (adminQuery) await searchAdminApplicants();
        if (expandedDirectionId) await loadDirectionApplicants(expandedDirectionId, true);
      });
    } catch (error) { setMessage((error as Error).message); }
  }

  async function loadDirectionApplicants(directionId: number, forceRefresh = false) {
    if (expandedDirectionId === directionId && !forceRefresh) {
      setExpandedDirectionId(null);
      setDirectionApplicants([]);
      return;
    }
    try {
      const data = await api.get<{ applicants: AdminDirectionApplicant[] }>(`/api/admin/directions/${directionId}/applicants`);
      setExpandedDirectionId(directionId);
      setDirectionApplicants(data.applicants);
    } catch (error) { setMessage((error as Error).message); }
  }

  if (!token) return <section className="admin-login"><form className="panel" onSubmit={login}><p className="eyebrow">Для сотрудников</p><h2>Вход в админку</h2><input type="email" placeholder="Email администратора" value={email} onChange={(e) => setEmail(e.target.value)} /><input type="password" placeholder="Пароль" value={password} onChange={(e) => setPassword(e.target.value)} /><button>Войти</button>{message && <p className="message">{message}</p>}</form></section>;

  return <section className="admin-grid">
    <div className="admin-session">
      <span>Административная сессия активна</span>
    </div>
    <div className="quick-upload wide">
      <div>
        <p className="eyebrow">Быстрая публикация</p>
        <h2>Загрузить новый рейтинг</h2>
        <p>Загрузите реестр заявлений. Система автоматически распределит абитуриентов по специальностям и отсортирует по среднему баллу.</p>
      </div>
      <div className="quick-upload-actions">
        <label className="quick-upload-button">
          Загрузить общий XLS / XLSX
          <input
            type="file"
            accept=".xls,.xlsx"
            onChange={(event) => {
              void importWorkbook(event.target.files?.[0]);
              event.target.value = "";
            }}
          />
        </label>
      </div>
    </div>
    <div className="panel wide applicant-admin">
      <p className="eyebrow">Внутренний поиск</p>
      <h2>Оригиналы документов</h2>
      <form className="admin-search" onSubmit={searchAdminApplicants}>
        <input placeholder="ФИО, СНИЛС или специальность" value={adminQuery} onChange={(event) => setAdminQuery(event.target.value)} />
        <button>Найти</button>
      </form>
      {message && <p className="message">{message}</p>}
      <div className="admin-applicants">{adminApplicants.map((applicant) => <div className="applicant-row" key={`${applicant.directionId}-${applicant.snilsNormalized}`}>
        <div><strong>{applicant.fullName || "ФИО не указано"}</strong><span>{applicant.snils} · {applicant.specialty} · место {applicant.position} · балл {applicant.averageScore}</span></div>
        <div className="admin-checks">
          <label className="original-check"><input type="checkbox" checked={applicant.priorityEnrollment} onChange={(event) => void setPriorityEnrollment(applicant.directionId, applicant.snilsNormalized, event.target.checked)} /><span>Первоочередное зачисление</span></label>
          <label className="original-check"><input type="checkbox" checked={applicant.originalProvided} onChange={(event) => void setOriginal(applicant.directionId, applicant.snilsNormalized, event.target.checked)} /><span>Оригинал предоставлен</span></label>
        </div>
      </div>)}</div>
    </div>
    <div className="panel wide published-ratings">
      <div className="section-title">
        <div>
          <div className="admin-tabs">
            <button className={adminRatingsView === "ratings" ? "active" : ""} onClick={() => setAdminRatingsView("ratings")}>Учёт оригиналов</button>
            <button className={adminRatingsView === "applicants" ? "active" : ""} onClick={() => setAdminRatingsView("applicants")}>Список абитуриентов</button>
          </div>
          {adminRatingsView === "ratings" && <p className="muted">Нажмите на специальность, чтобы раскрыть внутренний рейтинг и отметить оригиналы документов.</p>}
        </div>
        {adminRatingsView === "ratings" && !!directions.length && <button className="danger" onClick={removeAllDirections}>Удалить все специальности</button>}
      </div>
      {adminRatingsView === "ratings" ? <div className="admin-directions">{directions.map((item) => <div className="admin-row" key={item.id}>
        <button className="direction-expand" onClick={() => void loadDirectionApplicants(item.id)}>
          <strong>{item.specialty}</strong><span>{formatStudyFormWithPlaces(item)} · {item.applicant_count} записей</span>
        </button>
        <div className="admin-row-tools">
          <div className="places-form">
            <label><span>Бюджет</span><input type="number" min="0" placeholder="0" value={placeDrafts[item.id]?.budgetPlaces ?? ""} onChange={(event) => updatePlaceDraft(item.id, "budgetPlaces", event.target.value)} /><em>{placeStatuses[item.id]?.budgetPlaces}</em></label>
            <label><span>Внебюджет</span><input type="number" min="0" placeholder="0" value={placeDrafts[item.id]?.paidPlaces ?? ""} onChange={(event) => updatePlaceDraft(item.id, "paidPlaces", event.target.value)} /><em>{placeStatuses[item.id]?.paidPlaces}</em></label>
          </div>
          <button className="export-button" onClick={() => void exportOriginals(item.id)}>Выгрузить XLS</button>
        </div>
        {expandedDirectionId === item.id && <div className="expanded-rating">
          <div className="expanded-rating-head"><span>Место</span><span>Абитуриент</span><span className="score-cell">Средний балл</span><span>Первоочередное зачисление</span><span>Оригинал</span></div>
          {directionApplicants.map((applicant) => <div className="expanded-rating-row" key={`${expandedDirectionId}-${applicant.snilsNormalized}`}>
            <strong>#{applicant.position}</strong>
            <div><strong>{applicant.fullName || "ФИО не указано"}</strong><span>{applicant.snils}</span></div>
            <strong className="score-cell">{applicant.averageScore}</strong>
            <label className="original-check compact priority-check"><input type="checkbox" checked={applicant.priorityEnrollment} onChange={(event) => expandedDirectionId && void setPriorityEnrollment(expandedDirectionId, applicant.snilsNormalized, event.target.checked)} /><span>Первоочередное зачисление</span></label>
            <label className="original-check compact"><input type="checkbox" checked={applicant.originalProvided} onChange={(event) => expandedDirectionId && void setOriginal(expandedDirectionId, applicant.snilsNormalized, event.target.checked)} /><span>Принесён</span></label>
          </div>)}
        </div>}
      </div>)}</div> : <div className="admin-public-list"><ListsTab directions={directions} /></div>}
    </div>
  </section>;
}

export default function App() {
  const [directions, setDirections] = useState<Direction[]>([]);
  const [loadError, setLoadError] = useState("");
  const refresh = () =>
    api.get<Direction[]>("/api/directions")
      .then((data) => {
        setDirections(data);
        setLoadError("");
      })
      .catch(() => setLoadError("Не удалось подключиться к серверу. Проверьте, что backend запущен."));

  useEffect(() => {
    void refresh();
  }, []);

  useEffect(() => {
    const events = api.eventSource("/api/events");
    events.addEventListener("ratings-changed", () => {
      void keepScrollPosition(refresh);
    });
    return () => events.close();
  }, []);

  return <><header><div className="brand"><div className="logo">К</div><div><strong>Панель управления</strong><span>Для работников колледжа</span></div></div></header><main>{loadError && <p className="error-banner">{loadError}</p>}<Admin directions={directions} refresh={refresh} /></main></>;
}
