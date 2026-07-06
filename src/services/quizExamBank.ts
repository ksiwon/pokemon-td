// src/services/quizExamBank.ts
// 수능 모의고사 전용 큐레이션 문제은행 — 포덕 고인물 난이도.
// 커뮤니티/유튜브의 "포켓몬 수능·모의고사" 스타일을 참고해 저작한 4지선다.
// ★ 전부 사실 검증 가능한 문항만(진화·타입상성·종족값·특성·리전폼·세대 등).
//   애니/성우 등 PokeAPI로 확인 불가한 트리비아는 배제.

import { QuizQuestion } from '../types/quiz';

/** 현재 UI 언어(앱 전역과 동일 판별 — localStorage 'language'). */
const curLang = (): 'ko' | 'en' => (localStorage.getItem('language') === 'en' ? 'en' : 'ko');

interface BankQ {
  q: { ko: string; en: string };
  /** 보기 4개. */
  opts: { ko: string; en: string }[];
  /** 정답 인덱스(0~3). */
  correct: number;
}

export const EXAM_BANK: BankQ[] = [
  { q: { ko: '다음 중 통신교환으로 진화하는 포켓몬은?', en: 'Which Pokémon evolves via trade?' },
    opts: [{ ko: '팬텀', en: 'Gengar' }, { ko: '이상해꽃', en: 'Venusaur' }, { ko: '리자몽', en: 'Charizard' }, { ko: '거북왕', en: 'Blastoise' }], correct: 0 },
  { q: { ko: '전국도감 150번 포켓몬은?', en: 'Which Pokémon is National Dex #150?' },
    opts: [{ ko: '뮤츠', en: 'Mewtwo' }, { ko: '뮤', en: 'Mew' }, { ko: '루기아', en: 'Lugia' }, { ko: '딱구리', en: 'Golem' }], correct: 0 },
  { q: { ko: '다음 중 종족값 총합이 가장 높은 포켓몬은?', en: 'Which has the highest base stat total?' },
    opts: [{ ko: '뮤츠', en: 'Mewtwo' }, { ko: '한카리아스', en: 'Garchomp' }, { ko: '마기라스', en: 'Tyranitar' }, { ko: '메타그로스', en: 'Metagross' }], correct: 0 },
  { q: { ko: '다음 중 이브이의 진화형이 아닌 것은?', en: 'Which is NOT an Eevee evolution?' },
    opts: [{ ko: '마릴', en: 'Marill' }, { ko: '블래키', en: 'Umbreon' }, { ko: '님피아', en: 'Sylveon' }, { ko: '리피아', en: 'Leafeon' }], correct: 0 },
  { q: { ko: '페어리 타입이 무효화(0배)하는 공격 타입은?', en: 'Fairy is immune (0×) to which attacking type?' },
    opts: [{ ko: '드래곤', en: 'Dragon' }, { ko: '강철', en: 'Steel' }, { ko: '독', en: 'Poison' }, { ko: '불꽃', en: 'Fire' }], correct: 0 },
  { q: { ko: '드래곤 타입에게 효과가 굉장한(2배) 타입이 아닌 것은?', en: 'Which is NOT super-effective against Dragon?' },
    opts: [{ ko: '독', en: 'Poison' }, { ko: '얼음', en: 'Ice' }, { ko: '페어리', en: 'Fairy' }, { ko: '드래곤', en: 'Dragon' }], correct: 0 },
  { q: { ko: '고스트 타입에게 효과가 없는(0배) 공격 타입은?', en: 'Which attack does NOT affect Ghost (0×)?' },
    opts: [{ ko: '노말', en: 'Normal' }, { ko: '악', en: 'Dark' }, { ko: '에스퍼', en: 'Psychic' }, { ko: '땅', en: 'Ground' }], correct: 0 },
  { q: { ko: '다음 중 성도지방(2세대)에서 처음 등장한 포켓몬은?', en: 'Which debuted in Johto (Gen 2)?' },
    opts: [{ ko: '마릴', en: 'Marill' }, { ko: '또가스', en: 'Koffing' }, { ko: '롱스톤', en: 'Onix' }, { ko: '고라파덕', en: 'Golduck' }], correct: 0 },
  { q: { ko: '다음 중 환상의 포켓몬(Mythical)은?', en: 'Which is a Mythical Pokémon?' },
    opts: [{ ko: '뮤', en: 'Mew' }, { ko: '파이어', en: 'Moltres' }, { ko: '썬더', en: 'Zapdos' }, { ko: '프리져', en: 'Articuno' }], correct: 0 },
  { q: { ko: '다음 중 메가진화가 존재하지 않는 포켓몬은?', en: 'Which does NOT have a Mega Evolution?' },
    opts: [{ ko: '피카츄', en: 'Pikachu' }, { ko: '리자몽', en: 'Charizard' }, { ko: '이상해꽃', en: 'Venusaur' }, { ko: '거북왕', en: 'Blastoise' }], correct: 0 },
  { q: { ko: '다음 중 "알로라의 모습(리전폼)"이 있는 포켓몬은?', en: 'Which has an Alolan form?' },
    opts: [{ ko: '나인테일', en: 'Ninetales' }, { ko: '윈디', en: 'Arcanine' }, { ko: '부스터', en: 'Flareon' }, { ko: '펜드라', en: 'Scolipede' }], correct: 0 },
  { q: { ko: '1세대에서 스피드 종족값이 가장 높은 포켓몬은?', en: 'Highest base Speed Pokémon in Gen 1?' },
    opts: [{ ko: '마르마인', en: 'Electrode' }, { ko: '후딘', en: 'Alakazam' }, { ko: '피죤투', en: 'Pidgeot' }, { ko: '쥬레곤', en: 'Dewgong' }], correct: 0 },
  { q: { ko: '특성으로 "비(잔비)"를 부르는 포켓몬은?', en: 'Which summons rain (Drizzle)?' },
    opts: [{ ko: '가이오가', en: 'Kyogre' }, { ko: '그란돈', en: 'Groudon' }, { ko: '레쿠쟈', en: 'Rayquaza' }, { ko: '파비코리', en: 'Pheromosa' }], correct: 0 },
  { q: { ko: '거북왕의 바로 전 진화 단계는?', en: 'What does Blastoise evolve from?' },
    opts: [{ ko: '어니부기', en: 'Wartortle' }, { ko: '꼬부기', en: 'Squirtle' }, { ko: '리자드', en: 'Charmeleon' }, { ko: '이상해풀', en: 'Ivysaur' }], correct: 0 },
  { q: { ko: '다음 중 노말·비행 복합타입인 포켓몬은?', en: 'Which is Normal/Flying type?' },
    opts: [{ ko: '구구', en: 'Pidgey' }, { ko: '뮤', en: 'Mew' }, { ko: '또가스', en: 'Koffing' }, { ko: '꼬렛', en: 'Rattata' }], correct: 0 },
  { q: { ko: '풀 스타터 "치코리타"가 처음 등장한 세대는?', en: 'Which generation introduced Chikorita?' },
    opts: [{ ko: '2세대', en: 'Gen 2' }, { ko: '1세대', en: 'Gen 1' }, { ko: '3세대', en: 'Gen 3' }, { ko: '4세대', en: 'Gen 4' }], correct: 0 },
  { q: { ko: '이상해씨의 타입 조합은?', en: "What is Bulbasaur's typing?" },
    opts: [{ ko: '풀·독', en: 'Grass/Poison' }, { ko: '풀·땅', en: 'Grass/Ground' }, { ko: '풀', en: 'Grass' }, { ko: '풀·비행', en: 'Grass/Flying' }], correct: 0 },
  { q: { ko: '특성 "부유"로 땅 기술을 받지 않는 포켓몬은?', en: 'Which ignores Ground moves via Levitate?' },
    opts: [{ ko: '또가스', en: 'Koffing' }, { ko: '딱구리', en: 'Golem' }, { ko: '롱스톤', en: 'Onix' }, { ko: '두그리오', en: 'Dugtrio' }], correct: 0 },
  { q: { ko: '피카츄의 진화 전(베이비) 포켓몬은?', en: 'What is the baby form of Pikachu?' },
    opts: [{ ko: '피츄', en: 'Pichu' }, { ko: '라이츄', en: 'Raichu' }, { ko: '파치리스', en: 'Pachirisu' }, { ko: '에몽가', en: 'Emolga' }], correct: 0 },
  { q: { ko: '잠만보로 진화하는 포켓몬은?', en: 'Which evolves into Snorlax?' },
    opts: [{ ko: '먹고자', en: 'Munchlax' }, { ko: '야돈', en: 'Slowpoke' }, { ko: '노고치', en: 'Dunsparce' }, { ko: '링곰', en: 'Ursaring' }], correct: 0 },
  { q: { ko: '다음 중 물·땅 복합타입인 포켓몬은?', en: 'Which is Water/Ground type?' },
    opts: [{ ko: '늪짱이', en: 'Swampert' }, { ko: '샤크니아', en: 'Sharpedo' }, { ko: '밀로틱', en: 'Milotic' }, { ko: '갸라도스', en: 'Gyarados' }], correct: 0 },
  { q: { ko: '이른바 "전설의 개" 3마리(성도)에 속하지 않는 것은?', en: 'Which is NOT one of the Johto legendary beasts?' },
    opts: [{ ko: '루기아', en: 'Lugia' }, { ko: '라이코', en: 'Raikou' }, { ko: '앤테이', en: 'Entei' }, { ko: '스이쿤', en: 'Suicune' }], correct: 0 },
  { q: { ko: '다음 중 불꽃 타입 스타터가 아닌 것은?', en: 'Which is NOT a Fire-type starter?' },
    opts: [{ ko: '장크로다일', en: 'Feraligatr' }, { ko: '블레이범', en: 'Blaziken' }, { ko: '초염몽', en: 'Infernape' }, { ko: '리자몽', en: 'Charizard' }], correct: 0 },
  { q: { ko: '고래왕(윌로드)처럼 몸길이가 14.5m로 매우 큰 포켓몬은?', en: 'Which Pokémon is a huge 14.5 m long?' },
    opts: [{ ko: '고래왕', en: 'Wailord' }, { ko: '잉어킹', en: 'Magikarp' }, { ko: '거북왕', en: 'Blastoise' }, { ko: '이상해꽃', en: 'Venusaur' }], correct: 0 },
];

/** 은행 문항 → QuizQuestion(현지화). 셔플은 호출부에서 관리(중복 방지). */
export function bankToQuestion(index: number): QuizQuestion {
  const lang = curLang();
  const b = EXAM_BANK[index];
  return {
    kind: 'flavor', // 은행 문항은 미디어 없는 지식형 — 렌더는 텍스트 지문+보기
    prompt: b.q[lang],
    answerType: 'choice',
    options: b.opts.map(o => ({ label: o[lang] })),
    correctIndex: b.correct,
    reveal: { title: b.opts[b.correct][lang] },
  };
}
