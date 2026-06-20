import type { Applicant, Direction } from "../../shared/types/rating";
import { formatDate, formatStudyFormWithPlaces } from "../../shared/lib/format";

type ApplicantsTableProps = {
  direction?: Direction;
  applicants: Applicant[];
};

export function ApplicantsTable({ direction, applicants }: ApplicantsTableProps) {
  if (!direction) return <div className="table-panel"><p>Выберите направление.</p></div>;

  return <div className="table-panel">
    <p className="eyebrow">{formatStudyFormWithPlaces(direction)}</p>
    <h2>{direction.specialty}</h2>
    <div className="meta"><span>Обновлено: {formatDate(direction.updated_at)}</span></div>
    <div className="table-wrap"><table>
      <thead><tr><th>Место</th><th className="snils-cell">СНИЛС</th><th className="score-cell">Средний балл</th><th>Оригинал</th></tr></thead>
      <tbody>{applicants.map((item) => <tr key={`${item.position}-${item.snils}`}>
        <td><strong>{item.position}</strong></td>
        <td className="snils-cell">{item.snils}</td>
        <td className="score-cell">{item.averageScore}</td>
        <td><span className={item.originalProvided ? "original-mark active" : "original-mark"} title={item.originalProvided ? "Оригинал принесён" : "Оригинал не принесён"}>{item.originalProvided ? "✓" : "×"}</span></td>
      </tr>)}</tbody>
    </table></div>
  </div>;
}
