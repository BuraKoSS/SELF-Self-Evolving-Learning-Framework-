// Kişi 2'nin belirlediği standart "Erteleme Nedenleri"
// Görseldeki istek: time conflict, overload, user choice
export const POSTPONE_REASONS = {
  TIME_CONFLICT: "Zaman Çakışması",
  OVERLOAD: "Aşırı Yük / Yorgunluk",
  UNEXPECTED: "Beklenmedik Durum",
  USER_CHOICE: "Kendi Tercihim (Canım İstemedi)",
} as const;

export type PostponeReason = keyof typeof POSTPONE_REASONS;

// Event Payload Yapıları (Kişi 1'in 'payload?: TPayload' kısmı için)
export interface FocusPayload {
  goalId: number;
  durationMinutes: number;
  completedAt: Date;
}

export interface PostponePayload {
  goalId: number;
  reason: PostponeReason;
  note?: string;
}

export interface CancelPayload {
  goalId: number;
  reason?: string;
}