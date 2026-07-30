// sim/pvp/boards.ts
// 대표 보드 아키타입 fixture — Riot GAT의 "board string" 방식.
// 실험 설계:
//   [수량 vs 품질]  nosyn6(저가6) / mid4(중가4) / expensive3(고가3)
//     ⚠ 구매가 곡선이 k·(BST/600)^1.5 로 바뀐 뒤로는 이 셋의 골드가 더 이상 등가가 아니다
//       (고정 로스터라 맞출 수 없음). 수량vs품질의 정식 측정은 sim/tools/goldValue.sim.ts
//       (npm run sim:gold) — 현재 가격 곡선을 역산해 매번 동일 골드 보드를 새로 만든다.
//   [시너지 가치]   water6(타입6) vs nosyn6, gen1x6(세대6) vs nosyn6 — BST·레벨 동일
//   [진화 가치]     charizard3(진화체) vs charmander3(미진화) — 동일 기본형·동일 레벨
//   [역할 축]       tank6(내구) — 상대 축
// 모든 보드 lv15 기준(진화 실험만 lv36). 레벨업은 실전에서 무료(XP)이므로
// 골드 등가는 구매가(Σbuy) 기준으로 본다. candy 비용은 참고치로만 기록.
// 시너지 실험(water6/gen1x6 vs nosyn6)은 셋 다 6마리·유사 BST라 새 곡선에서도 등가 유지.

import { buildBoard, BuiltBoard } from '../support/teamBuilder';

const LV = 15;

export interface BoardSpec {
  name: string;
  description: string;
  members: Array<{ id: number; level: number; baseId?: number }>;
}

export const BOARD_SPECS: BoardSpec[] = [
  {
    name: 'nosyn6',
    description: '저가 6마리 · 시너지 없음 (타입/세대 전부 상이) — 기준선',
    members: [
      { id: 25, level: LV },   // 피카츄 (전기, 1세대)
      { id: 155, level: LV },  // 브케인 (불꽃, 2세대)
      { id: 252, level: LV },  // 나무지기 (풀, 3세대)
      { id: 443, level: LV },  // 딥상어동 (드래곤/땅, 4세대)
      { id: 532, level: LV },  // 으랏차 (격투, 5세대)
      { id: 679, level: LV },  // 단칼빙 (강철/고스트, 6세대)
    ],
  },
  {
    name: 'water6',
    description: '물 스타터 6마리 · 타입시너지 6(스탯×1.3+약점반감) — nosyn6와 등가골드/등레벨',
    members: [
      { id: 7, level: LV },    // 꼬부기
      { id: 158, level: LV },  // 리아코
      { id: 258, level: LV },  // 물짱이
      { id: 393, level: LV },  // 팽도리
      { id: 501, level: LV },  // 수댕이
      { id: 656, level: LV },  // 개구마르
    ],
  },
  {
    name: 'gen1x6',
    description: '1세대 6마리 · 세대시너지 6(스탯×1.3) · 타입 전부 상이 — nosyn6와 등가골드/등레벨',
    members: [
      { id: 1, level: LV },    // 이상해씨
      { id: 4, level: LV },    // 파이리
      { id: 7, level: LV },    // 꼬부기
      { id: 25, level: LV },   // 피카츄
      { id: 66, level: LV },   // 알통몬
      { id: 74, level: LV },   // 꼬마돌
    ],
  },
  {
    name: 'mid4',
    description: '중가 4마리 (BST 400~490) — 수량vs품질 중간축',
    members: [
      { id: 26, level: LV },   // 라이츄
      { id: 159, level: LV },  // 엘리게이
      { id: 286, level: LV },  // 버섯모
      { id: 398, level: LV },  // 찌르호크
    ],
  },
  {
    name: 'expensive3',
    description: '고가 3마리 (BST 550~600) — 수량vs품질 품질축',
    members: [
      { id: 445, level: LV },  // 한카리아스
      { id: 376, level: LV },  // 메타그로스
      { id: 637, level: LV },  // 불카모스
    ],
  },
  {
    name: 'tank6',
    description: '내구형 6마리 (HP/방어 특화) · 시너지 최소화',
    members: [
      { id: 113, level: LV },  // 럭키 (노말, 1)
      { id: 213, level: LV },  // 단단지 (벌레/바위, 2)
      { id: 324, level: LV },  // 코터스 (불꽃, 3)
      { id: 449, level: LV },  // 히포포타스 (땅, 4)
      { id: 597, level: LV },  // 철시드 (풀/강철, 5)
      { id: 712, level: LV },  // 꽁어름 (얼음, 6)
    ],
  },
  {
    name: 'charizard3',
    description: '리자몽 3마리 lv36 (진화 완료) — 구매가는 파이리 기준',
    members: [
      { id: 6, level: 36, baseId: 4 },
      { id: 6, level: 36, baseId: 4 },
      { id: 6, level: 36, baseId: 4 },
    ],
  },
  {
    name: 'charmander3',
    description: '파이리 3마리 lv36 (진화 안 함) — charizard3와 동일 구매가/레벨',
    members: [
      { id: 4, level: 36 },
      { id: 4, level: 36 },
      { id: 4, level: 36 },
    ],
  },
];

export async function buildAllBoards(): Promise<BuiltBoard[]> {
  const out: BuiltBoard[] = [];
  for (const spec of BOARD_SPECS) {
    out.push(await buildBoard(spec.name, spec.description, spec.members));
  }
  return out;
}
