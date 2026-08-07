// 속도전 출제기 점검 — createSpeedSession()이 5종목 전부에서 실제로 문제를 만들어 내는지.
//
// 왜 필요한가: 속도전 진행은 호스트 한 명이 문제를 만들어 방송하는 구조다. 어떤 종목에서
// next()가 던지면 SpeedQuizRoom이 1.5초 간격으로 무한 재시도하고 **게임이 시작되지 않는다.**
// 화면에는 "문제 준비 중"만 남아 원인이 보이지 않으므로, 배포 전에 여기서 걸러 낸다.
//
// PokeAPI를 실제로 호출한다(네트워크 필요). 실패 시 스킵이 아니라 실패로 남긴다.

import { describe, it, expect } from 'vitest';
import { createSpeedSession, normalizeAnswer } from '../../src/services/QuizEngine';
import { normalizeKinds } from '../../src/services/QuizRoomService';
import { SPEED_QUIZ_KINDS, SpeedQuizKind } from '../../src/types/quiz';

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

const ROUNDS = 24; // 5종목이 골고루 나오도록 넉넉히

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

  it('종목이 비었거나 이상하면 전 종목으로 되돌린다', async () => {
    // RTDB는 빈 배열을 저장하지 않아 필드가 통째로 사라진다. 그대로 두면 출제 풀이 비어
    // 호스트가 1.5초마다 재시도하며 게임이 영영 시작되지 않는다.
    expect(normalizeKinds(undefined)).toEqual([...SPEED_QUIZ_KINDS]);
    expect(normalizeKinds([])).toEqual([...SPEED_QUIZ_KINDS]);
    expect(normalizeKinds(['nope', 'cry'])).toEqual(['cry']);
    // RTDB는 배열을 인덱스 키 객체로 돌려줄 수 있다.
    expect(normalizeKinds({ 0: 'zoom', 1: 'hint' })).toEqual(['zoom', 'hint']);
  });

  it('빈 종목 목록으로도 출제가 멈추지 않는다', { timeout: 60_000 }, async () => {
    const round = await createSpeedSession().next({ t, lang: 'ko' }, []);
    expect(SPEED_QUIZ_KINDS).toContain(round.payload.kind);
  });
});
