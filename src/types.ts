export type Direction = {
  id: number;
  specialty: string;
  study_form: "Очная" | "Заочная";
  budget_places: number | null;
  paid_places: number | null;
  updated_at: string | null;
  applicant_count: number;
};

export type Applicant = {
  position: number;
  snils: string;
  averageScore: number | string;
  originalProvided: boolean;
  priorityEnrollment: boolean;
};

export type SearchResult = {
  direction_id: number;
  specialty: string;
  study_form: string;
  budget_places: number | null;
  paid_places: number | null;
  updated_at: string | null;
  position: number;
  snils: string;
  average_score: number | string;
  originalProvided: boolean;
  priorityEnrollment: boolean;
};

export type AdminApplicant = {
  fullName: string;
  directionId: number;
  snils: string;
  snilsNormalized: string;
  originalProvided: boolean;
  priorityEnrollment: boolean;
  position: number;
  averageScore: number | string;
  specialty: string;
  studyForm: string;
};

export type AdminDirectionApplicant = Omit<AdminApplicant, "specialty" | "studyForm">;
