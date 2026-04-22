import en from './en.json';
import ptBR from './pt-BR.json';

export type Language = 'en' | 'pt-BR';

export const dictionaries: Record<Language, Record<string, string>> = {
  'en': en,
  'pt-BR': ptBR,
};

export const localeMap: Record<Language, string> = {
  'en': 'en-US',
  'pt-BR': 'pt-BR',
};

export const LANGUAGES: { code: Language; label: string }[] = [
  { code: 'en',    label: 'English' },
  { code: 'pt-BR', label: 'Português (Brasil)' },
];

export function isLanguage(v: unknown): v is Language {
  return v === 'en' || v === 'pt-BR';
}
