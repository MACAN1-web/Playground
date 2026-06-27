import { useEffect, useMemo, useState } from "react";
import { api, configureAuthToken } from "../shared/api/client";
import type { AdminApplicant, AdminDirectionApplicant, AdminReport, Applicant, Direction, ReportCategory, SearchResult } from "../shared/types/rating";
import { LoginPage } from "../pages/LoginPage/LoginPage";
import { AdminHeader } from "../widgets/Header/AdminHeader";

const reportCategories: { key: ReportCategory; title: string }[] = [
  { key: "budget_9", title: "Бюджет на базе 9 класса" },
  { key: "paid_9_fulltime", title: "Внебюджет на базе 9 класса очно" },
  { key: "paid_9_parttime", title: "Внебюджет на базе 9 класса очно-заочно" },
  { key: "paid_11_distance", title: "Внебюджет на базе 11 класса заочно" }
];

const todayInputValue = () => {
  const date = new Date();
  const part = (number: number) => String(number).padStart(2, "0");
  return `${date.getFullYear()}-${part(date.getMonth() + 1)}-${part(date.getDate())}`;
};

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

const isFundingChangeBlocked = <T extends { directionId?: number; snilsNormalized: string; fundingType: "Бюджет" | "Внебюджет" }>(items: T[], item: T, paidOnly: boolean, fallbackDirectionId?: number | null) => {
  const nextFundingType = paidOnly ? "Внебюджет" : "Бюджет";
  if (nextFundingType === item.fundingType) return false;

  const directionId = item.directionId ?? fallbackDirectionId;
  return items.some((candidate) =>
    (candidate.directionId ?? fallbackDirectionId) === directionId &&
    candidate.snilsNormalized === item.snilsNormalized &&
    candidate.fundingType === nextFundingType
  );
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
  const [fundingFilter, setFundingFilter] = useState<"Бюджет" | "Внебюджет">("Бюджет");
  const direction = directions.find((item) => item.id === selected);
  const budgetCount = useMemo(() => applicants.filter((item) => item.fundingType !== "Внебюджет").length, [applicants]);
  const paidCount = applicants.length - budgetCount;
  const filteredApplicants = useMemo(
    () => applicants.filter((item) => fundingFilter === "Внебюджет" ? item.fundingType === "Внебюджет" : item.fundingType !== "Внебюджет"),
    [applicants, fundingFilter]
  );

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
    <div className="funding-tabs" aria-label="Тип рейтинга">
      <button className={fundingFilter === "Бюджет" ? "active" : ""} type="button" onClick={() => setFundingFilter("Бюджет")}>Бюджет <span>{budgetCount}</span></button>
      <button className={fundingFilter === "Внебюджет" ? "active" : ""} type="button" onClick={() => setFundingFilter("Внебюджет")}>Внебюджет <span>{paidCount}</span></button>
    </div>
    <div className="table-wrap"><table>
      <thead><tr><th>Место</th><th className="snils-cell">СНИЛС</th><th className="score-cell">Средний балл</th><th className="funding-cell">Тип</th><th>Оригинал</th></tr></thead>
      <tbody>{filteredApplicants.map((item, index) => <tr key={`${item.position}-${item.snils}-${item.fundingType}`}><td><strong>{index + 1}</strong></td><td className="snils-cell">{item.snils}</td><td className="score-cell">{item.averageScore}</td><td className="funding-cell"><span className={item.fundingType === "Внебюджет" ? "funding-pill" : "funding-pill quiet"}>{item.fundingType === "Внебюджет" ? "внебюджет" : "бюджет"}</span></td><td><span className={item.originalProvided ? "original-mark active" : "original-mark"} title={item.originalProvided ? "Оригинал принесён" : "Оригинал не принесён"}>{item.originalProvided ? "✓" : "×"}</span></td></tr>)}</tbody>
    </table></div>
    {!filteredApplicants.length && <p className="empty-filter">В этом списке пока нет абитуриентов.</p>}
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
  const [authChecking, setAuthChecking] = useState(Boolean(sessionStorage.getItem("admin-access-token")));
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [adminQuery, setAdminQuery] = useState("");
  const [adminApplicants, setAdminApplicants] = useState<AdminApplicant[]>([]);
  const [expandedDirectionId, setExpandedDirectionId] = useState<number | null>(null);
  const [directionApplicants, setDirectionApplicants] = useState<AdminDirectionApplicant[]>([]);
  const [placeDrafts, setPlaceDrafts] = useState<Record<number, { budgetPlaces: string; paidPlaces: string }>>({});
  const [placeStatuses, setPlaceStatuses] = useState<Record<number, { budgetPlaces?: string; paidPlaces?: string }>>({});
  const [adminRatingsView, setAdminRatingsView] = useState<"ratings" | "applicants" | "report">("ratings");
  const [isExportingOriginals, setIsExportingOriginals] = useState(false);
  const [exportMessage, setExportMessage] = useState("");
  const [reportDate, setReportDate] = useState(todayInputValue());
  const [reportCategory, setReportCategory] = useState<ReportCategory>("budget_9");
  const [report, setReport] = useState<AdminReport | null>(null);
  const [reportMessage, setReportMessage] = useState("");

  useEffect(() => {
    configureAuthToken(
      () => sessionStorage.getItem("admin-access-token") || token,
      (newToken) => {
        if (newToken) sessionStorage.setItem("admin-access-token", newToken);
        else sessionStorage.removeItem("admin-access-token");
        setToken(newToken);
      }
    );
  }, [token]);

  useEffect(() => {
    if (!token) {
      setAuthChecking(false);
      return;
    }

    let cancelled = false;
    setAuthChecking(true);
    api.get<{ user: { id: number; role: string } }>("/api/auth/me")
      .then(() => {
        if (!cancelled) setMessage("");
      })
      .catch(() => {
        if (!cancelled) {
          sessionStorage.removeItem("admin-access-token");
          setToken("");
          setMessage("Сессия истекла. Войдите заново.");
        }
      })
      .finally(() => {
        if (!cancelled) setAuthChecking(false);
      });

    return () => {
      cancelled = true;
    };
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
    if (!token || adminRatingsView !== "report") return;
    void loadReport();
  }, [token, adminRatingsView, reportDate, reportCategory]);

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

  async function exportAllOriginals() {
    if (isExportingOriginals) return;
    setIsExportingOriginals(true);
    setExportMessage("Готовим файл...");
    try {
      const { blob, filename } = await api.download("/api/admin/export-originals");
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      document.body.append(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setExportMessage("Файл выгружен.");
      setMessage("");
    } catch (error) {
      setExportMessage((error as Error).message);
    } finally {
      setIsExportingOriginals(false);
    }
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
    const syncAdminData = (event: Event) => {
      let reason = "";
      try {
        reason = JSON.parse((event as MessageEvent<string>).data || "{}").reason ?? "";
      } catch {
        reason = "";
      }
      if (reason === "original" || reason === "priority") return;

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

  async function setOriginal(directionId: number, snils: string, fundingType: "Бюджет" | "Внебюджет", originalProvided: boolean) {
    try {
      await api.patch(`/api/admin/applicants/${snils}/original`, { directionId, fundingType, originalProvided });
      setAdminApplicants((current) => current.map((applicant) => applicant.snilsNormalized === snils
        ? { ...applicant, originalProvided: originalProvided && applicant.directionId === directionId && applicant.fundingType === fundingType }
        : applicant));
      setDirectionApplicants((current) => current.map((applicant) => applicant.snilsNormalized === snils
        ? { ...applicant, originalProvided: originalProvided && expandedDirectionId === directionId && applicant.fundingType === fundingType }
        : applicant));
      setMessage("");
    } catch (error) { setMessage((error as Error).message); }
  }

  async function setPriorityEnrollment(directionId: number, snils: string, fundingType: "Бюджет" | "Внебюджет", priorityEnrollment: boolean) {
    try {
      await api.patch(`/api/admin/applicants/${snils}/priority`, { directionId, fundingType, priorityEnrollment });
      setAdminApplicants((current) => current.map((applicant) => applicant.snilsNormalized === snils && applicant.directionId === directionId && applicant.fundingType === fundingType
        ? { ...applicant, priorityEnrollment }
        : applicant));
      setDirectionApplicants((current) => current.map((applicant) => applicant.snilsNormalized === snils && applicant.fundingType === fundingType
        ? { ...applicant, priorityEnrollment }
        : applicant));
      setMessage("");
    } catch (error) { setMessage((error as Error).message); }
  }

  async function setFundingType(directionId: number, snils: string, currentFundingType: "Бюджет" | "Внебюджет", paidOnly: boolean) {
    const fundingType = paidOnly ? "Внебюджет" : "Бюджет";
    try {
      await api.patch(`/api/admin/applicants/${snils}/funding`, { directionId, currentFundingType, paidOnly });
      setAdminApplicants((current) => current.map((applicant) => applicant.snilsNormalized === snils && applicant.directionId === directionId && applicant.fundingType === currentFundingType
        ? { ...applicant, fundingType }
        : applicant));
      setDirectionApplicants((current) => current.map((applicant) => applicant.snilsNormalized === snils && applicant.fundingType === currentFundingType
        ? { ...applicant, fundingType }
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

  async function loadReport() {
    try {
      const data = await api.get<AdminReport>(`/api/admin/report?date=${encodeURIComponent(reportDate)}&category=${encodeURIComponent(reportCategory)}`);
      setReport(data);
      setReportMessage("");
    } catch (error) {
      setReport(null);
      setReportMessage((error as Error).message);
    }
  }

  if (authChecking) return <section className="admin-grid"><div className="panel wide"><p className="message">Проверяем сессию администратора...</p></div></section>;
  if (!token) return <LoginPage email={email} password={password} message={message} onEmailChange={setEmail} onPasswordChange={setPassword} onSubmit={login} />;

  const reportTotals = report?.directions.reduce(
    (totals, item) => ({
      applicationsCount: totals.applicationsCount + item.applicationsCount,
      originalsCount: totals.originalsCount + item.originalsCount,
      priorityCount: totals.priorityCount + item.priorityCount
    }),
    { applicationsCount: 0, originalsCount: 0, priorityCount: 0 }
  );

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
        <button className="quick-upload-button" type="button" disabled={isExportingOriginals} onClick={() => void exportAllOriginals()}>
          {isExportingOriginals ? "Готовим файл..." : "Выгрузить оригиналы XLSX"}
        </button>
        {exportMessage && <span>{exportMessage}</span>}
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
      <div className="admin-applicants">{adminApplicants.map((applicant) => <div className="applicant-row" key={`${applicant.directionId}-${applicant.snilsNormalized}-${applicant.fundingType}`}>
        <div><strong>{applicant.fullName || "ФИО не указано"}</strong><span>{applicant.snils} · {applicant.specialty} · место {applicant.position} · балл {applicant.averageScore}</span></div>
        <div className="admin-checks">
          <label className="original-check"><input type="checkbox" checked={applicant.priorityEnrollment} onChange={(event) => void setPriorityEnrollment(applicant.directionId, applicant.snilsNormalized, applicant.fundingType, event.target.checked)} /><span>Первоочередное зачисление</span></label>
          <label className="original-check paid-check" title="Ручной признак внебюджета"><input type="checkbox" checked={applicant.fundingType === "Внебюджет"} onChange={(event) => {
            if (isFundingChangeBlocked(adminApplicants, applicant, event.target.checked)) {
              event.preventDefault();
              setMessage("У абитуриента уже есть отдельные строки бюджета и внебюджета по этой специальности.");
              return;
            }
            void setFundingType(applicant.directionId, applicant.snilsNormalized, applicant.fundingType, event.target.checked);
          }} /><span>Внебюджет</span></label>
          <label className="original-check"><input type="checkbox" checked={applicant.originalProvided} onChange={(event) => void setOriginal(applicant.directionId, applicant.snilsNormalized, applicant.fundingType, event.target.checked)} /><span>Оригинал предоставлен</span></label>
        </div>
      </div>)}</div>
    </div>
    <div className="panel wide published-ratings">
      <div className="section-title">
        <div>
          <div className="admin-tabs">
            <button className={adminRatingsView === "ratings" ? "active" : ""} onClick={() => setAdminRatingsView("ratings")}>Учёт оригиналов</button>
            <button className={adminRatingsView === "applicants" ? "active" : ""} onClick={() => setAdminRatingsView("applicants")}>Список абитуриентов</button>
            <button className={adminRatingsView === "report" ? "active" : ""} onClick={() => setAdminRatingsView("report")}>Отчёт</button>
          </div>
          {adminRatingsView === "ratings" && <p className="muted">Нажмите на специальность, чтобы раскрыть внутренний рейтинг и отметить оригиналы документов.</p>}
          {adminRatingsView === "report" && <p className="muted">Выберите дату и категорию, чтобы посмотреть статистику по специальностям.</p>}
        </div>
        {adminRatingsView === "ratings" && !!directions.length && <button className="danger" onClick={removeAllDirections}>Удалить все специальности</button>}
      </div>
      {adminRatingsView === "ratings" && <div className="admin-directions">{directions.map((item) => <div className="admin-row" key={item.id}>
        <button className="direction-expand" onClick={() => void loadDirectionApplicants(item.id)}>
          <strong>{item.specialty}</strong><span>{formatStudyFormWithPlaces(item)} · {item.applicant_count} записей</span>
        </button>
        <div className="admin-row-tools">
          <div className="places-form">
            <label><span>Бюджет</span><input type="number" min="0" placeholder="0" value={placeDrafts[item.id]?.budgetPlaces ?? ""} onChange={(event) => updatePlaceDraft(item.id, "budgetPlaces", event.target.value)} /><em>{placeStatuses[item.id]?.budgetPlaces}</em></label>
            <label><span>Внебюджет</span><input type="number" min="0" placeholder="0" value={placeDrafts[item.id]?.paidPlaces ?? ""} onChange={(event) => updatePlaceDraft(item.id, "paidPlaces", event.target.value)} /><em>{placeStatuses[item.id]?.paidPlaces}</em></label>
          </div>
        </div>
        {expandedDirectionId === item.id && <div className="expanded-rating">
          <div className="expanded-rating-head"><span>Место</span><span>Абитуриент</span><span className="score-cell">Средний балл</span><span>Первоочередное зачисление</span><span className="funding-cell">Внебюджет</span><span>Оригинал</span></div>
          {directionApplicants.map((applicant) => <div className="expanded-rating-row" key={`${expandedDirectionId}-${applicant.snilsNormalized}-${applicant.fundingType}`}>
            <strong>#{applicant.position}</strong>
            <div><strong>{applicant.fullName || "ФИО не указано"}</strong><span>{applicant.snils}</span></div>
            <strong className="score-cell">{applicant.averageScore}</strong>
            <label className="original-check compact priority-check"><input type="checkbox" checked={applicant.priorityEnrollment} onChange={(event) => expandedDirectionId && void setPriorityEnrollment(expandedDirectionId, applicant.snilsNormalized, applicant.fundingType, event.target.checked)} /><span>Первоочередное зачисление</span></label>
            <label className="original-check compact paid-check funding-cell" title="Ручной признак внебюджета"><input type="checkbox" checked={applicant.fundingType === "Внебюджет"} onChange={(event) => {
              if (!expandedDirectionId) return;
              if (isFundingChangeBlocked(directionApplicants, applicant, event.target.checked, expandedDirectionId)) {
                event.preventDefault();
                setMessage("У абитуриента уже есть отдельные строки бюджета и внебюджета по этой специальности.");
                return;
              }
              void setFundingType(expandedDirectionId, applicant.snilsNormalized, applicant.fundingType, event.target.checked);
            }} /><span>Внебюджет</span></label>
            <label className="original-check compact"><input type="checkbox" checked={applicant.originalProvided} onChange={(event) => expandedDirectionId && void setOriginal(expandedDirectionId, applicant.snilsNormalized, applicant.fundingType, event.target.checked)} /><span>Принесён</span></label>
          </div>)}
        </div>}
      </div>)}</div>}
      {adminRatingsView === "applicants" && <div className="admin-public-list"><ListsTab directions={directions} /></div>}
      {adminRatingsView === "report" && <div className="report-panel">
        <div className="report-controls">
          <label><span>Дата отчёта</span><input type="date" value={reportDate} onChange={(event) => setReportDate(event.target.value)} /></label>
          {report && <div className="report-summary">
            <strong>Всего поданных заявлений: {report.totalApplications}</strong>
            <div>
              {reportCategories.map((category) => <span key={category.key}>{category.title}: {report.categoryApplications[category.key] ?? 0}</span>)}
            </div>
          </div>}
        </div>
        <div className="report-tabs">
          {reportCategories.map((category) => <button key={category.key} className={reportCategory === category.key ? "active" : ""} onClick={() => setReportCategory(category.key)}>{category.title}</button>)}
        </div>
        {reportMessage && <p className="message">{reportMessage}</p>}
        {report && <div className="report-table">
          <div className="report-table-head"><span>Специальность</span><span>Подали заявление</span><span>Оригиналы</span><span>Первоочередные</span></div>
          {report.directions.map((item) => <div className="report-table-row" key={item.directionId}>
            <div><strong>{item.specialty}</strong><span>{item.studyForm} · бюджет: {item.budgetPlaces ?? 0} · внебюджет: {item.paidPlaces ?? 0}</span></div>
            <strong>{item.applicationsCount}</strong>
            <strong>{item.originalsCount}</strong>
            <strong>{item.priorityCount}</strong>
          </div>)}
          {!!report.directions.length && reportTotals && <div className="report-table-row report-table-total">
            <div><strong>Итого</strong><span>Сумма по выбранной категории</span></div>
            <strong>{reportTotals.applicationsCount}</strong>
            <strong>{reportTotals.originalsCount}</strong>
            <strong>{reportTotals.priorityCount}</strong>
          </div>}
          {!report.directions.length && <p className="muted">Нет специальностей для выбранной категории.</p>}
        </div>}
      </div>}
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

  return <><AdminHeader /><main>{loadError && <p className="error-banner">{loadError}</p>}<Admin directions={directions} refresh={refresh} /></main></>;
}
