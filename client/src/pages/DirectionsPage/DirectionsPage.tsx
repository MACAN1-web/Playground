import { useEffect, useState } from "react";
import { api } from "../../shared/api/client";
import type { Applicant, Direction } from "../../shared/types/rating";
import { formatStudyFormWithPlaces } from "../../shared/lib/format";
import { ApplicantsTable } from "../../widgets/ApplicantsTable/ApplicantsTable";

export function DirectionsPage({ directions }: { directions: Direction[] }) {
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

  const applicantsPanel = <ApplicantsTable direction={direction} applicants={applicants} />;

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
