import { cookies } from 'next/headers';
import { dictionaries, LOCALE_COOKIE, type Dictionary, type Locale } from './dictionaries';

export async function getServerLocale(): Promise<Locale> {
  const cookieStore = await cookies();
  const value = cookieStore.get(LOCALE_COOKIE)?.value;
  return value === 'en' ? 'en' : 'ko';
}

export async function getServerDictionary(): Promise<Dictionary> {
  const locale = await getServerLocale();
  return dictionaries[locale] as Dictionary;
}
