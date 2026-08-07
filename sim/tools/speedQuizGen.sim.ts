// 속도전 출제기 점검 — createSpeedSession()이 전 종목에서 실제로 문제를 만들어 내는지.
//
// 왜 필요한가: 속도전 진행은 호스트 한 명이 문제를 만들어 방송하는 구조다. 어떤 종목에서
// next()가 던지면 SpeedQuizRoom이 1.5초 간격으로 무한 재시도하고 **게임이 시작되지 않는다.**
// 화면에는 "문제 준비 중"만 남아 원인이 보이지 않으므로, 배포 전에 여기서 걸러 낸다.
//
// PokeAPI를 실제로 호출한다(네트워크 필요). 실패 시 스킵이 아니라 실패로 남긴다.

import { describe, it, expect } from 'vitest';
import { createSpeedSession, normalizeAnswer } from '../../src/services/QuizEngine';
import { normalizeKinds } from '../../src/services/QuizRoomService';
import { SPEED_QUIZ_KINDS, SpeedQuizKind, speedKindsForLang } from '../../src/types/quiz';
import DEX_TYPE from '../../src/data/pokedexTypeIndex.json';

// QuizEngine은 이미지 프리로드에 브라우저 전역 Image를 쓴다. Node에는 없으므로 최소 대체물.
// (프리로드는 UX 장치라 여기선 성공했다고 치고 넘어가면 된다 — 출제 로직만 검증한다.)
class FakeImage {
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  set src(_url: string) { setTimeout(() => this.onload?.(), 0); }
}
(globalThis as unknown as { Image: unknown }).Image = FakeImage;

/** 실제 UI의 t()를 대신한다 — 키를 그대로 돌려주면 문자열 조립 경로가 그대로 실행된다. */
const t = (key: string, vars?: Record<string, unknown>) =>
  vars ? `${key}(${Object.values(vars).join(',')})` : key;

const ROUNDS = 24; // 종목이 골고루 나오도록 넉넉히

/** 번들 인덱스로 '이름 → 타입 집합'을 다시 만든다(엔진 내부 맵은 export되지 않는다). */
const TYPES_BY_NAME = new Map<string, string[]>();
for (const e of DEX_TYPE as Array<{ ko: string; en: string; t: string[] }>) {
  if (e.ko) TYPES_BY_NAME.set(normalizeAnswer(e.ko), e.t);
  if (e.en) TYPES_BY_NAME.set(normalizeAnswer(e.en), e.t);
}
const sameTyping = (a: string[], b: string[]) =>
  a.length === b.length && [...a].sort().join('|') === [...b].sort().join('|');

describe('속도전 출제기', () => {
  for (const lang of ['ko', 'en'] as const) {
    it(`${lang}: ${ROUNDS}문제를 끊김 없이 만든다`, { timeout: 180_000 }, async () => {
      const session = createSpeedSession();
      const seen = new Set<string>();

      for (let i = 0; i < ROUNDS; i++) {
        const round = await session.next({ t, lang });

        expect(SPEED_QUIZ_KINDS, `${i}번 문제의 종목`).toContain(round.payload.kind);
        seen.add(round.payload.kind);

        // 정답 후보: 비어 있으면 아무도 못 맞힌다(전원 0점으로 판이 흘러간다).
        expect(round.accept.length, `${round.payload.kind}: 정답 후보`).toBeGreaterThan(0);
        for (const a of round.accept) {
          expect(normalizeAnswer(a).length, `${round.payload.kind}: 정규화 후 빈 정답`).toBeGreaterThan(0);
        }

        // 공개 화면에 이름이 있어야 정답을 알려 줄 수 있다.
        expect(round.reveal.title?.length ?? 0).toBeGreaterThan(0);

        // 종목별로 출제에 반드시 필요한 소재가 실려 있는지.
        const p = round.payload;
        if (p.kind === 'silhouette') { expect(p.imageUrl).toBeTruthy(); expect(p.silhouette).toBe(true); }
        if (p.kind === 'zoom') { expect(p.imageUrl).toBeTruthy(); expect(p.zoom).toBeTruthy(); }
        if (p.kind === 'cry') expect(p.audioUrl).toBeTruthy();
        if (p.kind === 'flavor') expect((p.text ?? '').length).toBeGreaterThan(0);
        if (p.kind === 'hint') expect((p.hintLines ?? []).length).toBeGreaterThan(0);
        if (p.kind === 'type') expect(p.imageUrl).toBeTruthy();
        // 타입(어려움)은 지문이 곧 타이핑이다 — 슬러그가 없으면 문제가 빈 화면이 된다.
        if (p.kind === 'typeHard') expect((p.typeSlugs ?? []).length).toBeGreaterThan(0);
        if (p.kind === 'chosungEasy' || p.kind === 'chosungHard') expect(p.bigText).toBeTruthy();
        // 어려움은 갈래를 숨기는 게 종목의 정의다. 페이로드에 실리면 콘솔에서 그대로 보인다.
        if (p.kind === 'chosungHard') expect(p.chosungCat).toBeUndefined();

        // 지문에 정답이 그대로 노출되면 문제가 성립하지 않는다(도감설명 이름 마스킹 검증).
        const body = normalizeAnswer([p.text ?? '', ...(p.hintLines ?? [])].join(' '));
        if (body) {
          for (const a of round.accept) {
            const norm = normalizeAnswer(a);
            if (norm.length >= 3) {
              expect(body.includes(norm), `${p.kind}: 지문에 정답("${a}")이 노출됨`).toBe(false);
            }
          }
        }
      }

      // 한쪽 종목만 계속 나오면 "속도전 = 실루엣만"이 된다.
      expect(seen.size, `${ROUNDS}문제에서 나온 종목 수`).toBeGreaterThanOrEqual(3);
    });
  }

  it('방이 고른 종목만 출제한다', { timeout: 180_000 }, async () => {
    const picked: SpeedQuizKind[] = ['cry', 'zoom'];
    const session = createSpeedSession();
    for (let i = 0; i < 16; i++) {
      const round = await session.next({ t, lang: 'ko' }, picked);
      expect(picked, `${i}번 문제가 고르지 않은 종목으로 나옴`).toContain(round.payload.kind);
    }
  });

  it('영어 방에서는 초성이 절대 출제되지 않는다', { timeout: 180_000 }, async () => {
    // 초성열은 한글 음절에서만 만들어진다. 영어 이름에 toChosung을 걸면 이름이 그대로 나와
    // 정답이 보인다 — 종목 목록에서부터 빠져 있어야 한다.
    expect(speedKindsForLang('en')).not.toContain('chosungEasy');
    expect(speedKindsForLang('en')).not.toContain('chosungHard');
    const session = createSpeedSession();
    for (let i = 0; i < 16; i++) {
      const round = await session.next({ t, lang: 'en' });
      expect(['chosungEasy', 'chosungHard'], `${i}번 문제`).not.toContain(round.payload.kind);
    }
  });

  it('타입 종목은 영어 방에서도 출제된다', { timeout: 120_000 }, async () => {
    // 타입명은 양쪽 언어로 다 번역돼 있어 초성과 달리 언어 제한이 없다.
    expect(speedKindsForLang('en')).toContain('type');
    expect(speedKindsForLang('en')).toContain('typeHard');
  });

  it('한국어 초성 문제는 초성열과 정답을 갖춘다', { timeout: 120_000 }, async () => {
    const session = createSpeedSession();
    for (const kind of ['chosungEasy', 'chosungHard'] as const) {
      for (let i = 0; i < 3; i++) {
        const round = await session.next({ t, lang: 'ko' }, [kind]);
        expect(round.payload.kind).toBe(kind);
        expect(round.payload.bigText, '초성열이 비었다').toBeTruthy();
        expect(round.accept.length).toBeGreaterThan(0);
        // 초성열에 정답이 그대로 들어 있으면 문제가 성립하지 않는다.
        const big = normalizeAnswer(round.payload.bigText ?? '');
        for (const a of round.accept) {
          const norm = normalizeAnswer(a);
          if (norm.length >= 2) expect(big.includes(norm), `초성열에 정답 노출: ${a}`).toBe(false);
        }
      }
    }
  });

  it('타입(쉬움)은 타입 조합을 한/영·순서 무관으로 인정한다', { timeout: 120_000 }, async () => {
    // 방에 언어가 섞여 있으므로 한쪽 언어만 인정하면 반대쪽 유저가 구조적으로 못 맞힌다.
    const session = createSpeedSession();
    for (let i = 0; i < 6; i++) {
      const round = await session.next({ t, lang: 'ko' }, ['type']);
      expect(round.payload.kind).toBe('type');
      const norm = round.accept.map(normalizeAnswer);
      expect(new Set(norm).size, '정답 후보가 중복뿐이다').toBeGreaterThanOrEqual(2);
      // 복합타입이면 한/영 × 순서 2가지 = 4개가 나와야 한다(단일은 한/영 2개).
      const dual = round.accept.some(a => a.includes('/'));
      expect(norm.length, dual ? '복합타입 후보 수' : '단일타입 후보 수')
        .toBe(dual ? 4 : 2);
    }
  });

  it('타입(어려움)의 정답 후보는 제시 타이핑과 정확히 일치하는 것뿐이다', { timeout: 120_000 }, async () => {
    // 솔로판은 술어로 채점하지만 속도전은 accept 목록 대조뿐이라, 목록 자체가 곧 채점 규칙이다.
    // 부분 일치(고스트/독이 '고스트' 문제에 끼는 것)가 섞이면 그 순간 종목이 무너진다.
    const session = createSpeedSession();
    for (let i = 0; i < 8; i++) {
      const round = await session.next({ t, lang: 'ko' }, ['typeHard']);
      expect(round.payload.kind).toBe('typeHard');
      const want = round.payload.typeSlugs ?? [];
      expect(want.length).toBeGreaterThan(0);
      expect(round.accept.length).toBeGreaterThan(0);
      for (const a of round.accept) {
        const got = TYPES_BY_NAME.get(normalizeAnswer(a));
        expect(got, `번들에 없는 이름이 정답 후보로 들어옴: ${a}`).toBeTruthy();
        expect(sameTyping(got!, want), `${a}(${got}) 는 ${want} 와 다른 타이핑`).toBe(true);
      }
    }
  });

  it('종목이 비었거나 이상하면 전 종목으로 되돌린다', async () => {
    // RTDB는 빈 배열을 저장하지 않아 필드가 통째로 사라진다. 그대로 두면 출제 풀이 비어
    // 호스트가 1.5초마다 재시도하며 게임이 영영 시작되지 않는다.
    expect(normalizeKinds(undefined)).toEqual([...SPEED_QUIZ_KINDS]);
    expect(normalizeKinds([])).toEqual([...SPEED_QUIZ_KINDS]);
    expect(normalizeKinds(['nope', 'cry'])).toEqual(['cry']);
    // 영어 방에 초성이 저장돼 있어도 걸러 낸다.
    expect(normalizeKinds(['chosungHard', 'cry'], 'en')).toEqual(['cry']);
    expect(normalizeKinds(['chosungEasy'], 'en')).toEqual(speedKindsForLang('en'));
    // 배포 시점에 살아 있던 구버전 방: 'chosung' 하나가 쉬움/어려움 둘로 갈렸다.
    // 그냥 걸러 버리면 방이 고른 종목이 통째로 사라져 '전 종목'으로 되돌아간다.
    expect(normalizeKinds(['chosung'], 'ko')).toEqual(['chosungEasy', 'chosungHard']);
    expect(normalizeKinds(['chosung', 'cry'], 'ko')).toEqual(['chosungEasy', 'chosungHard', 'cry']);
    // RTDB는 배열을 인덱스 키 객체로 돌려줄 수 있다.
    expect(normalizeKinds({ 0: 'zoom', 1: 'hint' })).toEqual(['zoom', 'hint']);
  });

  it('빈 종목 목록으로도 출제가 멈추지 않는다', { timeout: 60_000 }, async () => {
    const round = await createSpeedSession().next({ t, lang: 'ko' }, []);
    expect(SPEED_QUIZ_KINDS).toContain(round.payload.kind);
  });
});
