// 영어 모드 한글 누출 점검 — 번역 파일이 아니라 **출제 결과물**을 본다.
//
// 왜 필요한가: ko.json/en.json 키 대조는 통과해도, 퀴즈 지문·보기·정답은 런타임에
// PokeAPI 응답과 번들 데이터(signatureMoves.json 등)로 조립된다. 여기에 한국어 이름이
// 섞이면 영어권 유저에게 한글이 그대로 보이고, 키 대조로는 절대 잡히지 않는다.

import { describe, it, expect } from 'vitest';
import { createQuizSession } from '../../src/services/QuizEngine';
import { availableQuizKinds } from '../../src/types/quiz';

class FakeImage {
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  set src(_url: string) { setTimeout(() => this.onload?.(), 0); }
}
(globalThis as unknown as { Image: unknown }).Image = FakeImage;

/** t()는 키를 그대로 돌려준다 — 번역 문구가 아니라 **조립된 데이터**만 보기 위해서. */
const t = (key: string, vars?: Record<string, unknown>) =>
  vars ? `${key}(${Object.values(vars).join(',')})` : key;

// ⚠️ pokeAPI는 ctx.lang을 보지 않는다. `localStorage.language`를 **자기가 직접 읽어**
//    현지화 이름·도감설명을 고른다(api/pokeapi.ts의 getCurrentLanguage).
//    sim/support/bootstrap.ts가 이걸 'ko'로 고정해 두므로, 여기서 바꾸지 않으면
//    ctx.lang='en'인데 이름만 한국어로 돌아와 **전 종목이 누출로 오판된다**(실제로 9건 오탐).
localStorage.setItem('language', 'en');

const HANGUL = /[ㄱ-ㆎ가-힣]/;
const PER_KIND = 8;

describe('영어 모드 한글 누출', () => {
  const kinds = availableQuizKinds('en');

  it('초성 종목은 영어에서 아예 출제되지 않는다', () => {
    expect(kinds).not.toContain('chosungEasy');
    expect(kinds).not.toContain('chosungHard');
  });

  for (const kind of kinds) {
    it(`${kind}: ${PER_KIND}문제에 한글이 없다`, { timeout: 120_000 }, async () => {
      const session = createQuizSession(kind);
      const leaks: string[] = [];

      for (let i = 0; i < PER_KIND; i++) {
        const q = await session.next({ t, lang: 'en' });
        // 화면에 실제로 글자로 나가는 필드만 모은다(이미지 URL 등은 제외).
        const shown: Array<[string, unknown]> = [
          ['prompt', q.prompt],
          ['bigText', q.bigText],
          ['hintLines', q.hintLines],
          ['inputPlaceholder', q.inputPlaceholder],
          ['choices', (q as { choices?: unknown }).choices],
          ['answer', (q as { answer?: unknown }).answer],
          ['accept', (q as { accept?: unknown }).accept],
          ['reveal', (q as { reveal?: unknown }).reveal],
        ];
        for (const [field, v] of shown) {
          if (v == null) continue;
          const text = JSON.stringify(v);
          // t()가 돌려준 키 자체는 번역 파일이 담당하므로 제외한다.
          if (HANGUL.test(text)) leaks.push(`${field}: ${text.slice(0, 160)}`);
        }
      }

      expect(leaks, `${kind}에서 한글 누출:\n${leaks.join('\n')}`).toEqual([]);
    });
  }
});
