export const formatDate = (value: string | null) => {
  if (!value) return "ещё не опубликован";
  const date = new Date(value);
  const part = (number: number) => String(number).padStart(2, "0");
  return `${part(date.getDate())}.${part(date.getMonth() + 1)}.${date.getFullYear()} ${part(date.getHours())}:${part(date.getMinutes())}`;
};

export const formatStudyFormWithPlaces = (item: { study_form: string; budget_places: number | null; paid_places: number | null }) => {
  const parts = [item.study_form];
  if (typeof item.budget_places === "number") parts.push(`бюджет: ${item.budget_places}`);
  if (typeof item.paid_places === "number") parts.push(`внебюджет: ${item.paid_places}`);
  return parts.join(" · ");
};

export const splitSpecialty = (specialty: string) => {
  const match = specialty.match(/^(\d{2}\.\d{2}\.\d{2})\s+(.+)$/);
  if (!match) return { code: "", title: specialty };
  return { code: match[1], title: match[2] };
};

export const keepScrollPosition = async (callback: () => Promise<void>) => {
  const scrollX = window.scrollX;
  const scrollY = window.scrollY;
  await callback();
  window.requestAnimationFrame(() => {
    window.requestAnimationFrame(() => window.scrollTo(scrollX, scrollY));
  });
};
