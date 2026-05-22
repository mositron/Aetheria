// TODO i18n: strings should use useT() hook
export const en = {
  // Game UI
  inventory: "Inventory",
  equipment: "Equipment",
  skills: "Skills",
  quests: "Quests",
  chat: "Chat",
  settings: "Settings",
  // Actions
  confirm: "Confirm",
  cancel: "Cancel",
  close: "Close",
  // Combat
  attack: "Attack",
  defend: "Defend",
} as const;
export type LocaleKey = keyof typeof en;