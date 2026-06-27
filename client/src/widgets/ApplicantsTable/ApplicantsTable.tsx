import { useMemo, useState } from "react";
import type { Applicant, Direction } from "../../shared/types/rating";
import { formatDate, formatStudyFormWithPlaces } from "../../shared/lib/format";

type ApplicantsTableProps = {
  direction?: Direction;
  applicants: Applicant[];
};

export function ApplicantsTable({ direction, applicants }: ApplicantsTableProps) {
  const [fundingFilter, setFundingFilter] = useState<"Бюджет" | "Внебюджет">("Бюджет");

  const budgetCount = useMemo(() => applicants.filter((item) => item.fundingType !== "Внебюджет").length, [applicants]);
  const paidCount = applicants.length - budgetCount;
  const filteredApplicants = useMemo(
    () => applicants.filter((item) => fundingFilter === "Внебюджет" ? item.fundingType === "Внебюджет" : item.fundingType !== "Внебюджет"),
    [applicants, fundingFilter]
  );

  if (!direction) return <div className="table-panel"><p>Выберите направление.</p></div>;

  return <div className="table-panel">
    <p className="eyebrow">{formatStudyFormWithPlaces(direction)}</p>
    <h2>{direction.specialty}</h2>
    <div className="meta"><span>Обновлено: {formatDate(direction.updated_at)}</span></div>
    <div className="funding-tabs" aria-label="Тип рейтинга">
      <button className={fundingFilter === "Бюджет" ? "active" : ""} type="button" onClick={() => setFundingFilter("Бюджет")}>Бюджет <span>{budgetCount}</span></button>
      <button className={fundingFilter === "Внебюджет" ? "active" : ""} type="button" onClick={() => setFundingFilter("Внебюджет")}>Внебюджет <span>{paidCount}</span></button>
    </div>
    <div className="table-wrap"><table>
      <thead><tr><th>Место</th><th className="snils-cell">СНИЛС</th><th className="score-cell">Средний балл</th><th>Тип</th><th>Оригинал</th></tr></thead>
      <tbody>{filteredApplicants.map((item, index) => <tr key={`${item.position}-${item.snils}-${item.fundingType}`}>
        <td><strong>{index + 1}</strong></td>
        <td className="snils-cell">{item.snils}</td>
        <td className="score-cell">{item.averageScore}</td>
        <td>{item.fundingType === "Внебюджет" ? <span className="funding-pill">внебюджет</span> : <span className="funding-pill quiet">бюджет</span>}</td>
        <td><span className={item.originalProvided ? "original-mark active" : "original-mark"} title={item.originalProvided ? "Оригинал принесён" : "Оригинал не принесён"}>{item.originalProvided ? "✓" : "×"}</span></td>
      </tr>)}</tbody>
    </table></div>
    {!filteredApplicants.length && <p className="empty-filter">В этом списке пока нет абитуриентов.</p>}
  </div>;
}
