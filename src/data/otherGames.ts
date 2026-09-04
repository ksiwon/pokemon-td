// src/data/otherGames.ts
// ─────────────────────────────────────────────────────────────────────────────
// 만든 사람의 다른 게임 — 메인 메뉴의 "이런 게임은 어떠세요?"가 여는 목록.
//
// 같은 사람이 만든 포켓몬 소재 웹 게임이 셋이다(Aegis · Radiant Platinum ·
// PokeRhythm). 셋 다 각자의 도메인에 따로 서 있어서, 하나를 하러 온 사람에게
// 나머지 둘로 가는 길이 화면 어디에도 없었다.
//
// ⚠️ "나를 뺀 둘"을 손으로 적지 않는다. 사이트마다 둘씩 적어 두면 게임이 하나 늘 때
//    세 군데를 고쳐야 하고, 한 군데를 빠뜨려도 아무도 모른다. 목록은 셋을 다 적고
//    화면에 낼 때 SELF만 걸러낸다 — 그래서 이 파일은 세 저장소에 같은 내용으로
//    놓이고 SELF 한 줄만 다르다.
//
// ⚠️ 설명문은 여기 없다. 한국어/영어 둘 다 필요하므로 i18n(otherGames.games.*)에
//    있고, 여기 남는 것은 언어를 안 타는 것뿐이다 — 이름·주소·창틀 색.
// ─────────────────────────────────────────────────────────────────────────────
import type { BtnColor } from '../styles/pixel';

export interface OtherGame {
  /** i18n 키(otherGames.games.<key>)이자 자기 자신을 걸러내는 이름 */
  key: string;
  /** 게임 이름 — 번역하지 않는다. 셋 다 로마자 고유명이다 */
  name: string;
  url: string;
  /** 창틀 색. 셋을 한눈에 가른다 */
  accent: BtnColor;
}

/** 이 사이트가 그 셋 중 누구인가. 목록에서 자기 자신을 빼는 데 쓴다 */
export const SELF = 'aegis';

export const GAMES: OtherGame[] = [
  { key: 'aegis',      name: 'Pokemon Aegis',    url: 'https://aegis.siwon.it.kr',      accent: 'gold'   },
  { key: 'radiant',    name: 'Radiant Platinum', url: 'https://radiant.siwon.it.kr',    accent: 'green'  },
  { key: 'pokerhythm', name: 'PokeRhythm',       url: 'https://pokerhythm.siwon.it.kr', accent: 'purple' },
];

/** 여기 말고 갈 수 있는 곳 — 목록에서 나만 뺀 것 */
export const OTHER_GAMES: OtherGame[] = GAMES.filter(g => g.key !== SELF);
