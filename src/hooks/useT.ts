import { useAuth } from '../contexts/AuthContext';
import { dictionaries, localeMap, type Language } from '../i18n';

/**
 * Translation hook. Returns:
 *  - t(key, params?) — looks up the key in the active language dictionary,
 *    falling back to English, then to the key itself so missing strings are
 *    still visible without crashing. Supports `{name}` interpolation.
 *  - language — current Language code ('en' | 'pt-BR').
 *  - locale — BCP-47 string for Intl (e.g. 'pt-BR').
 */
export function useT() {
  const { preferredLanguage } = useAuth();
  const language: Language = preferredLanguage;
  const dict = dictionaries[language] ?? dictionaries.en;
  const fallback = dictionaries.en;

  const t = (key: string, params?: Record<string, string | number>): string => {
    let value = dict[key] ?? fallback[key] ?? key;
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        value = value.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v));
      }
    }
    return value;
  };

  return { t, language, locale: localeMap[language] };
}
