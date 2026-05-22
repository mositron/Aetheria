// TODO i18n: strings should use useT() hook
export const th = {
  // Game UI
  inventory: "อินเวนทอรี",
  equipment: "อุปกรณ์",
  skills: "สกิล",
  quests: "เควส",
  chat: "แชท",
  settings: "ตั้งค่า",
  // Actions
  confirm: "ยืนยัน",
  cancel: "ยกเลิก",
  close: "ปิด",
  // Combat
  attack: "โจมตี",
  defend: "ป้องกัน",
} as const;
export type LocaleKey = keyof typeof th;