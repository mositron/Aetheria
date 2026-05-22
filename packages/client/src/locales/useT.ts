import { th } from "./th";
import { en } from "./en";
import { useStore } from "../store";

const locales = { th, en } as const;

export type Lang = keyof typeof locales;

export function useT() {
  const lang = useStore((s) => s.lang);
  return (key: string): string => {
    const locale = locales[lang as Lang] ?? locales.th;
    return (locale as Record<string, string>)[key] ?? key;
  };
}