// src/i18n/I18nProvider.tsx
import React, { createContext, useState, useEffect, ReactNode } from 'react';
import ko from './translations/ko.json';
import en from './translations/en.json';

type Language = 'ko' | 'en';

interface TranslationContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (key: string, params?: Record<string, string | number>) => string;
}

export const TranslationContext = createContext<TranslationContextType | undefined>(undefined);

const translations = { ko, en };

/**
 * **지정한 언어로** 번역한다(UI 언어와 무관).
 *
 * 왜 필요한가: 퀴즈 속도전은 방을 만들 때 언어를 고르고, 호스트 한 명이 전원에게 나갈
 * 문제를 만든다. 호스트의 UI가 한국어인데 영어 방을 열었다면 지문이 영어로 나가야 한다 —
 * useTranslation의 t는 UI 언어에 묶여 있어 쓸 수 없다.
 */
export const translateIn = (
  lang: Language, key: string, params?: Record<string, string | number>,
): string => {
  let value: unknown = translations[lang];
  for (const k of key.split('.')) value = (value as Record<string, unknown> | undefined)?.[k];

  if (typeof value !== 'string') {
    console.warn(`Translation missing for key: ${key} (${lang})`);
    return key;
  }
  if (!params) return value;
  return value.replace(/\{(\w+)\}/g, (m, p) => params[p]?.toString() ?? m);
};

export const I18nProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [language, setLanguageState] = useState<Language>(() => {
    const saved = localStorage.getItem('language');
    if (saved === 'en' || saved === 'ko') return saved;
    const browserLang = navigator.language || (navigator as any).userLanguage;
    return browserLang && browserLang.toLowerCase().startsWith('ko') ? 'ko' : 'en';
  });

  useEffect(() => {
    localStorage.setItem('language', language);
  }, [language]);

  const setLanguage = (lang: Language) => {
    setLanguageState(lang);
  };

  const t = (key: string, params?: Record<string, string | number>): string =>
    translateIn(language, key, params);

  return (
    <TranslationContext.Provider value={{ language, setLanguage, t }}>
      {children}
    </TranslationContext.Provider>
  );
};

