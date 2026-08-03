// src/services/quizExamBank.ts
// 수능 모의고사 전용 큐레이션 문제은행 — "포켓몬 고인물능력시험" 난이도.
//
// 출제 방향(커뮤니티의 포켓몬 수능·배틀 모의고사·고인물능력시험 스타일 종합):
//   단순 도감/타입 암기가 아니라 '실전 배틀 메타 지식'을 묻는다.
//   ① 기술 우선도  ② 세대·타이틀별 사양 변경  ③ 노력치·개체값·성격 계산
//   ④ 특성 상호작용  ⑤ 지닌 도구 배율  ⑥ 날씨·필드  ⑦ 상태이상 수치
//   ⑧ 4배 약점·스텔스록  ⑨ 스피드 종족값 라인  ⑩ 데미지 계산식
//
// ★ 수치 출처: Bulbapedia(9세대) + Serebii Pokémon Champions 전용 페이지 + 포켓몬 위키(ko) 교차검증.
//   두 소스가 일치하는 값만 채택한다. 애니/성우 등 검증 불가 트리비아는 배제.
//   - Serebii: /pokemonchampions/statusconditions · /updatedattacks · /updatedabilities · /training
//   - 포켓몬 위키(ko): 얼음(상태이상) · 마비 · 잠듦 · 속이기 · Pokémon Champions 문서의 'Champions' 절
//
// ⚠ 사양이 갈리는 문항은 반드시 기준 타이틀을 문말에 괄호로 명시한다.
//   형식: '… 확률은? (포켓몬 챔피언스 기준)' / '… 확률은? (9세대 스칼렛·바이올렛 기준)'
//   Pokémon Champions(2026-04-08 발매)에서 9세대(SV) 대비 바뀐 항목이 있어,
//   기준을 안 밝히면 정답이 둘이 된다.
//   확인된 변경점(양쪽 소스 일치):
//     · 마비 행동불가 25% → 12.5% (스피드 -50%는 동일)
//     · 얼음 해동 20% → 25% + 3턴째 확정 해동
//     · 잠듦 2~4턴 → 2턴째 33.3% 기상, 3턴째 확정 기상
//     · 속이기: 등장 첫 턴이 아니면 '선택' 자체가 불가(우선도 +3·위력 40은 그대로)
//     · 기술 PP 일괄 상향(5→8, 10→12, 15→16) — 개별 예외 있음(예: 부리캐논 15→8)
//     · 특성 변경은 Unseen Fist 1건뿐 — 이 은행의 특성 문항(테크니션·매직가드 등)은 영향 없음
//   변경 없음이 확인된 항목: 급소율 1/24·1.5배, 자속 1.5배·테라 동타입 2.0배, 지닌도구 배율,
//   날씨·필드, 랭크 배율, 종족값, 타입 상성.

import { QuizQuestion } from '../types/quiz';

/** 현재 UI 언어(앱 전역과 동일 판별 — localStorage 'language'). */
const curLang = (): 'ko' | 'en' => (localStorage.getItem('language') === 'en' ? 'en' : 'ko');

interface BankQ {
  q: { ko: string; en: string };
  /** 보기 4개. 첫 번째(index 0)가 정답 — bankToQuestion에서 셔플됨. */
  opts: { ko: string; en: string }[];
  /** 정답 인덱스(0~3). 저작 편의상 항상 0. */
  correct: number;
}

export const EXAM_BANK: BankQ[] = [
  // ─── ① 기술 우선도 (5문항) ────────────────────────────────────────────────
  { q: { ko: '기술 "속이기"의 우선도는?', en: 'What is the priority of Fake Out?' },
    opts: [{ ko: '+3', en: '+3' }, { ko: '+1', en: '+1' }, { ko: '+2', en: '+2' }, { ko: '+4', en: '+4' }], correct: 0 },
  { q: { ko: '기술 "신속"의 우선도는?', en: 'What is the priority of Extreme Speed?' },
    opts: [{ ko: '+2', en: '+2' }, { ko: '+1', en: '+1' }, { ko: '+3', en: '+3' }, { ko: '+4', en: '+4' }], correct: 0 },
  { q: { ko: '기술 "트릭룸"의 우선도는?', en: 'What is the priority of Trick Room?' },
    opts: [{ ko: '-7', en: '-7' }, { ko: '0', en: '0' }, { ko: '-5', en: '-5' }, { ko: '-1', en: '-1' }], correct: 0 },
  { q: { ko: '"반격"과 "미러코트"의 우선도는?', en: 'What is the priority of Counter and Mirror Coat?' },
    opts: [{ ko: '-5', en: '-5' }, { ko: '-1', en: '-1' }, { ko: '-3', en: '-3' }, { ko: '-6', en: '-6' }], correct: 0 },
  { q: { ko: '다음 중 우선도가 +4인 기술은?', en: 'Which move has priority +4?' },
    opts: [{ ko: '방어', en: 'Protect' }, { ko: '속이기', en: 'Fake Out' }, { ko: '전광석화', en: 'Quick Attack' }, { ko: '도우미', en: 'Helping Hand' }], correct: 0 },

  // ─── ② 세대·타이틀별 사양 변경 (11문항) ───────────────────────────────────
  { q: { ko: '기술의 물리/특수가 "기술 개별"로 분리된 세대는?', en: 'Which generation introduced the physical/special split?' },
    opts: [{ ko: '4세대', en: 'Gen 4' }, { ko: '3세대', en: 'Gen 3' }, { ko: '5세대', en: 'Gen 5' }, { ko: '2세대', en: 'Gen 2' }], correct: 0 },
  { q: { ko: '급소 데미지 배율이 2배에서 1.5배로 하향된 세대는?', en: 'In which generation did the critical hit multiplier drop from 2× to 1.5×?' },
    opts: [{ ko: '6세대', en: 'Gen 6' }, { ko: '5세대', en: 'Gen 5' }, { ko: '7세대', en: 'Gen 7' }, { ko: '4세대', en: 'Gen 4' }], correct: 0 },
  { q: { ko: '7세대 이후 급소율 0단계(기본)의 확률은?', en: 'What is the stage-0 critical hit rate from Gen 7 onward?' },
    opts: [{ ko: '1/24 (약 4.17%)', en: '1/24 (~4.17%)' }, { ko: '1/16 (6.25%)', en: '1/16 (6.25%)' }, { ko: '1/8 (12.5%)', en: '1/8 (12.5%)' }, { ko: '1/32 (약 3.13%)', en: '1/32 (~3.13%)' }], correct: 0 },
  { q: { ko: '6세대에서 강철 타입이 잃어버린 두 가지 저항(0.5배)은?', en: 'Which two resistances did Steel type LOSE in Gen 6?' },
    opts: [{ ko: '고스트·악', en: 'Ghost and Dark' }, { ko: '얼음·바위', en: 'Ice and Rock' }, { ko: '드래곤·페어리', en: 'Dragon and Fairy' }, { ko: '에스퍼·비행', en: 'Psychic and Flying' }], correct: 0 },
  { q: { ko: '마비 상태의 스피드 감소가 75%에서 50%로 완화된 세대는?', en: 'In which generation was paralysis Speed reduction eased from 75% to 50%?' },
    opts: [{ ko: '7세대', en: 'Gen 7' }, { ko: '6세대', en: 'Gen 6' }, { ko: '5세대', en: 'Gen 5' }, { ko: '8세대', en: 'Gen 8' }], correct: 0 },
  { q: { ko: '"스텔스록"이 처음 등장한 세대는?', en: 'Which generation introduced Stealth Rock?' },
    opts: [{ ko: '4세대', en: 'Gen 4' }, { ko: '3세대', en: 'Gen 3' }, { ko: '5세대', en: 'Gen 5' }, { ko: '6세대', en: 'Gen 6' }], correct: 0 },
  { q: { ko: '다음 배틀 기믹을 도입 순서대로 바르게 나열한 것은?', en: 'Which lists these battle gimmicks in correct chronological order?' },
    opts: [
      { ko: '메가진화 → Z기술 → 다이맥스 → 테라스탈', en: 'Mega → Z-Move → Dynamax → Terastal' },
      { ko: 'Z기술 → 메가진화 → 테라스탈 → 다이맥스', en: 'Z-Move → Mega → Terastal → Dynamax' },
      { ko: '메가진화 → 다이맥스 → Z기술 → 테라스탈', en: 'Mega → Dynamax → Z-Move → Terastal' },
      { ko: 'Z기술 → 다이맥스 → 메가진화 → 테라스탈', en: 'Z-Move → Dynamax → Mega → Terastal' }], correct: 0 },
  { q: { ko: '3~5세대에서 한 능력치에 투자 가능한 노력치 상한은?', en: 'What was the per-stat EV cap in Gen 3-5?' },
    opts: [{ ko: '255', en: '255' }, { ko: '252', en: '252' }, { ko: '510', en: '510' }, { ko: '256', en: '256' }], correct: 0 },
  { q: { ko: '"속이기"에 생긴 변경점은? (포켓몬 챔피언스 기준)', en: 'What changed about Fake Out? (Pokémon Champions)' },
    opts: [
      { ko: '등장 첫 턴이 아니면 기술 선택 자체가 불가능해졌다', en: 'It can no longer even be selected unless it is the user\'s first turn out' },
      { ko: '우선도가 +3에서 +1로 하향됐다', en: 'Its priority dropped from +3 to +1' },
      { ko: '풀죽음 확률이 100%에서 50%로 하향됐다', en: 'Its flinch chance dropped from 100% to 50%' },
      { ko: '위력이 40에서 30으로 하향됐다', en: 'Its base power dropped from 40 to 30' }], correct: 0 },
  { q: { ko: '기술 PP가 전반적으로 상향됐다. 기존 PP 10이던 기술은 대부분 얼마가 됐나? (포켓몬 챔피언스 기준)', en: 'Move PP was raised across the board. Most moves that had 10 PP now have how much? (Pokémon Champions)' },
    opts: [{ ko: '12', en: '12' }, { ko: '15', en: '15' }, { ko: '16', en: '16' }, { ko: '20', en: '20' }], correct: 0 },
  { q: { ko: '포켓몬의 능력치·기술·특성을 바꾸는 방법은? (포켓몬 챔피언스 기준)', en: 'How do you change a Pokémon\'s stats, moves and Ability? (Pokémon Champions)' },
    opts: [
      { ko: '랭크배틀로 얻은 VP(빅토리 포인트)를 소모해 트레이닝한다', en: 'Spend Victory Points (VP) earned from Ranked Battles on training' },
      { ko: '야생 포켓몬을 쓰러뜨려 노력치를 쌓는다', en: 'Defeat wild Pokémon to accumulate EVs' },
      { ko: '레벨업 시 자동으로 분배된다', en: 'They are distributed automatically on level-up' },
      { ko: '대전 상대에게서 빼앗아 온다', en: 'You take them from your battle opponents' }], correct: 0 },

  // ─── ③ 노력치·개체값·성격 (6문항) ──────────────────────────────────────────
  { q: { ko: '6세대 이후 한 능력치에 투자 가능한 노력치 상한은?', en: 'What is the per-stat EV cap from Gen 6 onward?' },
    opts: [{ ko: '252', en: '252' }, { ko: '255', en: '255' }, { ko: '510', en: '510' }, { ko: '224', en: '224' }], correct: 0 },
  { q: { ko: '한 포켓몬이 가질 수 있는 노력치 총합의 상한은?', en: 'What is the maximum total EVs a Pokémon can have?' },
    opts: [{ ko: '510', en: '510' }, { ko: '508', en: '508' }, { ko: '512', en: '512' }, { ko: '504', en: '504' }], correct: 0 },
  { q: { ko: '레벨 100 기준, 실능력치 1을 올리는 데 필요한 노력치는?', en: 'At level 100, how many EVs raise a stat by 1 point?' },
    opts: [{ ko: '4', en: '4' }, { ko: '8', en: '8' }, { ko: '2', en: '2' }, { ko: '1', en: '1' }], correct: 0 },
  { q: { ko: '개체값(IV)이 가질 수 있는 최댓값은?', en: 'What is the maximum possible IV value?' },
    opts: [{ ko: '31', en: '31' }, { ko: '32', en: '32' }, { ko: '15', en: '15' }, { ko: '63', en: '63' }], correct: 0 },
  { q: { ko: '성격에 의한 능력치 보정 배율은?', en: 'What are the stat multipliers from a Pokémon\'s Nature?' },
    opts: [{ ko: '상승 1.1배 / 하락 0.9배', en: '1.1× up / 0.9× down' }, { ko: '상승 1.2배 / 하락 0.8배', en: '1.2× up / 0.8× down' }, { ko: '상승 1.5배 / 하락 0.5배', en: '1.5× up / 0.5× down' }, { ko: '상승 1.15배 / 하락 0.85배', en: '1.15× up / 0.85× down' }], correct: 0 },
  { q: { ko: '노력치 252를 한 능력치에 투자했을 때 레벨 100에서 오르는 실능력치는?', en: 'How many stat points does 252 EVs give at level 100?' },
    opts: [{ ko: '63', en: '63' }, { ko: '64', en: '64' }, { ko: '31', en: '31' }, { ko: '126', en: '126' }], correct: 0 },

  // ─── ④ 특성 상호작용 (8문항) ───────────────────────────────────────────────
  { q: { ko: '특성 "테크니션"이 위력을 1.5배로 올려주는 기준 위력은?', en: 'Technician boosts moves with base power up to what value?' },
    opts: [{ ko: '60 이하', en: '60 or less' }, { ko: '50 이하', en: '50 or less' }, { ko: '70 이하', en: '70 or less' }, { ko: '40 이하', en: '40 or less' }], correct: 0 },
  { q: { ko: '특성 "매직가드"를 가진 포켓몬이 받는 데미지는?', en: 'A Pokémon with Magic Guard takes damage only from what?' },
    opts: [{ ko: '공격 기술의 직접 데미지만', en: 'Direct damage from attacking moves only' }, { ko: '모든 데미지', en: 'All damage sources' }, { ko: '상태이상 데미지만', en: 'Status damage only' }, { ko: '날씨 데미지만', en: 'Weather damage only' }], correct: 0 },
  { q: { ko: '특성 "옹골참"의 효과로 옳은 것은?', en: 'What does the Ability Sturdy do?' },
    opts: [{ ko: 'HP가 가득 찼을 때 일격에 쓰러지지 않는다', en: 'Survives a one-hit KO at full HP' }, { ko: '급소를 맞지 않는다', en: 'Cannot be hit by critical hits' }, { ko: '능력치가 떨어지지 않는다', en: 'Stats cannot be lowered' }, { ko: '상태이상에 걸리지 않는다', en: 'Cannot be inflicted with status' }], correct: 0 },
  { q: { ko: '특성 "재생력(리제네레이터)"으로 교체 시 회복되는 HP는?', en: 'How much HP does Regenerator restore on switching out?' },
    opts: [{ ko: '최대 HP의 1/3', en: '1/3 of max HP' }, { ko: '최대 HP의 1/2', en: '1/2 of max HP' }, { ko: '최대 HP의 1/4', en: '1/4 of max HP' }, { ko: '최대 HP의 1/16', en: '1/16 of max HP' }], correct: 0 },
  { q: { ko: '특성 "장난꾸러기(짓궂은마음)"의 효과는?', en: 'What does the Ability Prankster do?' },
    opts: [{ ko: '변화 기술의 우선도 +1', en: 'Gives status moves +1 priority' }, { ko: '모든 기술의 우선도 +1', en: 'Gives all moves +1 priority' }, { ko: '변화 기술의 명중률 100%', en: 'Status moves never miss' }, { ko: '변화 기술의 위력 1.5배', en: 'Status moves deal 1.5× damage' }], correct: 0 },
  { q: { ko: '특성 "원더가드"를 가진 껍질몬에게 데미지를 줄 수 있는 공격은?', en: 'With Wonder Guard (Shedinja), which attacks can deal damage?' },
    opts: [{ ko: '효과가 굉장한(2배 이상) 기술만', en: 'Only super-effective moves' }, { ko: '물리 기술만', en: 'Only physical moves' }, { ko: '자속 기술만', en: 'Only STAB moves' }, { ko: '위력 100 이상 기술만', en: 'Only moves with 100+ base power' }], correct: 0 },
  { q: { ko: '특성 "천진(Unaware)"의 효과는?', en: 'What does the Ability Unaware do?' },
    opts: [{ ko: '상대의 능력치 랭크 변화를 무시한다', en: 'Ignores the opponent\'s stat stage changes' }, { ko: '상대의 특성을 무시한다', en: 'Ignores the opponent\'s Ability' }, { ko: '타입 상성을 무시한다', en: 'Ignores type effectiveness' }, { ko: '상대의 도구를 무시한다', en: 'Ignores the opponent\'s held item' }], correct: 0 },
  { q: { ko: '특성 "위협(Intimidate)"이 등장 시 깎는 능력치와 랭크는?', en: 'Intimidate lowers which stat, by how many stages, on entry?' },
    opts: [{ ko: '공격 1랭크', en: 'Attack by 1 stage' }, { ko: '방어 1랭크', en: 'Defense by 1 stage' }, { ko: '공격 2랭크', en: 'Attack by 2 stages' }, { ko: '스피드 1랭크', en: 'Speed by 1 stage' }], correct: 0 },

  // ─── ⑤ 지닌 도구 배율 (6문항) ──────────────────────────────────────────────
  { q: { ko: '"생명의구슬"의 위력 배율과 반동 데미지는?', en: 'What is Life Orb\'s damage boost and recoil?' },
    opts: [{ ko: '1.3배 / 최대 HP의 1/10', en: '1.3× / 1/10 of max HP' }, { ko: '1.5배 / 최대 HP의 1/8', en: '1.5× / 1/8 of max HP' }, { ko: '1.2배 / 최대 HP의 1/16', en: '1.2× / 1/16 of max HP' }, { ko: '1.3배 / 최대 HP의 1/8', en: '1.3× / 1/8 of max HP' }], correct: 0 },
  { q: { ko: '"구애스카프"가 올려주는 능력치와 배율은?', en: 'Which stat does Choice Scarf boost, and by how much?' },
    opts: [{ ko: '스피드 1.5배', en: 'Speed by 1.5×' }, { ko: '공격 1.5배', en: 'Attack by 1.5×' }, { ko: '스피드 2배', en: 'Speed by 2×' }, { ko: '특공 1.5배', en: 'Sp. Atk by 1.5×' }], correct: 0 },
  { q: { ko: '"진화의휘석"의 효과는?', en: 'What does Eviolite do?' },
    opts: [{ ko: '미진화 포켓몬의 방어·특방 1.5배', en: 'Raises Def and Sp. Def of not-fully-evolved Pokémon by 1.5×' }, { ko: '모든 포켓몬의 방어 2배', en: 'Doubles Defense for all Pokémon' }, { ko: '진화 레벨을 낮춘다', en: 'Lowers the evolution level' }, { ko: '미진화 포켓몬의 공격·특공 1.5배', en: 'Raises Atk and Sp. Atk of NFE Pokémon by 1.5×' }], correct: 0 },
  { q: { ko: '"돌격조끼(Assault Vest)"의 효과로 옳은 것은?', en: 'Which describes Assault Vest correctly?' },
    opts: [{ ko: '특방 1.5배, 단 변화 기술 사용 불가', en: 'Sp. Def ×1.5, but cannot use status moves' }, { ko: '방어 1.5배, 단 변화 기술 사용 불가', en: 'Def ×1.5, but cannot use status moves' }, { ko: '특방 2배, 단 교체 불가', en: 'Sp. Def ×2, but cannot switch out' }, { ko: '특방 1.5배, 단 한 기술만 사용 가능', en: 'Sp. Def ×1.5, but locked into one move' }], correct: 0 },
  { q: { ko: '"먹다남은음식(Leftovers)"이 매 턴 회복하는 HP는?', en: 'How much HP does Leftovers restore each turn?' },
    opts: [{ ko: '최대 HP의 1/16', en: '1/16 of max HP' }, { ko: '최대 HP의 1/8', en: '1/8 of max HP' }, { ko: '최대 HP의 1/10', en: '1/10 of max HP' }, { ko: '최대 HP의 1/4', en: '1/4 of max HP' }], correct: 0 },
  { q: { ko: '"기합의띠(Focus Sash)"가 발동하는 조건은?', en: 'Under what condition does Focus Sash activate?' },
    opts: [{ ko: 'HP가 가득 찬 상태에서 쓰러질 공격을 받았을 때', en: 'When hit by a KO move at full HP' }, { ko: 'HP가 절반 이하일 때', en: 'When HP is at or below half' }, { ko: '급소를 맞았을 때', en: 'When hit by a critical hit' }, { ko: '효과가 굉장한 공격을 받았을 때', en: 'When hit by a super-effective move' }], correct: 0 },

  // ─── ⑥ 날씨·필드 (5문항) ───────────────────────────────────────────────────
  { q: { ko: '"모래바람" 날씨에서 바위 타입이 얻는 이점은?', en: 'What benefit do Rock types gain in a Sandstorm?' },
    opts: [{ ko: '특수방어 1.5배', en: 'Sp. Def ×1.5' }, { ko: '방어 1.5배', en: 'Defense ×1.5' }, { ko: '공격 1.5배', en: 'Attack ×1.5' }, { ko: '스피드 2배', en: 'Speed ×2' }], correct: 0 },
  { q: { ko: '"트릭룸"의 지속 턴 수는?(발동 턴 포함)', en: 'How many turns does Trick Room last?' },
    opts: [{ ko: '5턴', en: '5 turns' }, { ko: '3턴', en: '3 turns' }, { ko: '8턴', en: '8 turns' }, { ko: '4턴', en: '4 turns' }], correct: 0 },
  { q: { ko: '"사이코필드"가 지면에 있는 포켓몬에게 주는 효과는?', en: 'What does Psychic Terrain do to grounded Pokémon?' },
    opts: [{ ko: '우선도 기술의 대상이 되지 않는다', en: 'They cannot be hit by priority moves' }, { ko: '잠듦 상태가 되지 않는다', en: 'They cannot fall asleep' }, { ko: '모든 상태이상에 걸리지 않는다', en: 'They cannot be statused' }, { ko: '매 턴 HP를 회복한다', en: 'They recover HP each turn' }], correct: 0 },
  { q: { ko: '"일렉트릭필드"가 지면에 있는 포켓몬에게 주는 효과는?', en: 'What does Electric Terrain do to grounded Pokémon?' },
    opts: [{ ko: '잠듦 상태가 되지 않는다', en: 'They cannot fall asleep' }, { ko: '마비 상태가 되지 않는다', en: 'They cannot be paralyzed' }, { ko: '우선도 기술을 받지 않는다', en: 'They cannot be hit by priority moves' }, { ko: '전기 기술을 무효화한다', en: 'They are immune to Electric moves' }], correct: 0 },
  { q: { ko: '"쾌청(맑음)" 날씨에서 물 타입 기술의 위력 배율은?', en: 'In harsh sunlight, what is the multiplier on Water-type moves?' },
    opts: [{ ko: '0.5배', en: '0.5×' }, { ko: '1.5배', en: '1.5×' }, { ko: '1.0배(변화 없음)', en: '1.0× (unchanged)' }, { ko: '0배(무효)', en: '0× (immune)' }], correct: 0 },

  // ─── ⑦ 상태이상 수치 (8문항) — SV/챔피언스 사양이 갈리므로 기준 명시 필수 ──
  { q: { ko: '"화상" 상태가 반감시키는 능력치는?', en: 'Which stat does the Burn status halve?' },
    opts: [{ ko: '물리 공격', en: 'Physical Attack' }, { ko: '특수공격', en: 'Special Attack' }, { ko: '방어', en: 'Defense' }, { ko: '스피드', en: 'Speed' }], correct: 0 },
  { q: { ko: '"맹독" 상태의 데미지는 매 턴 어떻게 변하는가?', en: 'How does Badly Poisoned (Toxic) damage change each turn?' },
    opts: [{ ko: '1/16씩 누적 증가(1/16, 2/16, 3/16…)', en: 'Increases by 1/16 each turn (1/16, 2/16, 3/16…)' }, { ko: '매 턴 1/8로 고정', en: 'Fixed at 1/8 each turn' }, { ko: '매 턴 두 배로 증가', en: 'Doubles each turn' }, { ko: '매 턴 1/16으로 고정', en: 'Fixed at 1/16 each turn' }], correct: 0 },
  { q: { ko: '"마비" 상태에서 행동하지 못할 확률은? (9세대 스칼렛·바이올렛 기준)', en: 'What is the chance a paralyzed Pokémon cannot move? (Gen 9 Scarlet/Violet)' },
    opts: [{ ko: '25%', en: '25%' }, { ko: '50%', en: '50%' }, { ko: '12.5%', en: '12.5%' }, { ko: '33%', en: '33%' }], correct: 0 },
  { q: { ko: '"마비" 상태에서 행동하지 못할 확률은? (포켓몬 챔피언스 기준)', en: 'What is the chance a paralyzed Pokémon cannot move? (Pokémon Champions)' },
    opts: [{ ko: '12.5%', en: '12.5%' }, { ko: '25%', en: '25%' }, { ko: '50%', en: '50%' }, { ko: '33%', en: '33%' }], correct: 0 },
  { q: { ko: '"얼음(빙결)" 상태가 매 턴 자연 해동될 확률은? (9세대 스칼렛·바이올렛 기준)', en: 'What is the chance a frozen Pokémon thaws each turn? (Gen 9 Scarlet/Violet)' },
    opts: [{ ko: '20%', en: '20%' }, { ko: '25%', en: '25%' }, { ko: '10%', en: '10%' }, { ko: '50%', en: '50%' }], correct: 0 },
  { q: { ko: '"얼음(빙결)" 상태가 매 턴 해동될 확률은? (포켓몬 챔피언스 기준)', en: 'What is the chance a frozen Pokémon thaws each turn? (Pokémon Champions)' },
    opts: [{ ko: '25%', en: '25%' }, { ko: '20%', en: '20%' }, { ko: '33%', en: '33%' }, { ko: '50%', en: '50%' }], correct: 0 },
  { q: { ko: '"얼음(빙결)" 상태의 지속 상한은? (포켓몬 챔피언스 기준)', en: 'How long can Freeze last at most? (Pokémon Champions)' },
    opts: [
      { ko: '3턴째에 반드시 해동된다', en: 'The Pokémon always thaws on the third turn' },
      { ko: '5턴째에 반드시 해동된다', en: 'It always thaws on the fifth turn' },
      { ko: '해동될 때까지 상한이 없다', en: 'There is no cap — it lasts until it thaws' },
      { ko: '2턴째에 반드시 해동된다', en: 'It always thaws on the second turn' }], correct: 0 },
  { q: { ko: '"잠듦" 사양으로 옳은 것은? (포켓몬 챔피언스 기준)', en: 'Which describes Sleep correctly? (Pokémon Champions)' },
    opts: [
      { ko: '2턴째에 33.3%로 깨어나고, 3턴째에는 반드시 깨어난다', en: '33.3% chance to wake on turn 2; always wakes on turn 3' },
      { ko: '9세대와 같이 2~4턴 지속된다', en: 'Lasts 2-4 turns, same as Gen 9' },
      { ko: '항상 2턴으로 고정이다', en: 'Always lasts exactly 2 turns' },
      { ko: '1턴째부터 50%로 깨어난다', en: '50% chance to wake starting on turn 1' }], correct: 0 },

  // ─── ⑧ 4배 약점 · 스텔스록 (5문항) ─────────────────────────────────────────
  { q: { ko: '한카리아스(드래곤·땅)의 4배 약점 타입은?', en: 'What type hits Garchomp (Dragon/Ground) for 4× damage?' },
    opts: [{ ko: '얼음', en: 'Ice' }, { ko: '드래곤', en: 'Dragon' }, { ko: '페어리', en: 'Fairy' }, { ko: '물', en: 'Water' }], correct: 0 },
  { q: { ko: '마기라스(바위·악)의 4배 약점 타입은?', en: 'What type hits Tyranitar (Rock/Dark) for 4× damage?' },
    opts: [{ ko: '격투', en: 'Fighting' }, { ko: '땅', en: 'Ground' }, { ko: '물', en: 'Water' }, { ko: '벌레', en: 'Bug' }], correct: 0 },
  { q: { ko: '핫삼(벌레·강철)의 4배 약점 타입은?', en: 'What type hits Scizor (Bug/Steel) for 4× damage?' },
    opts: [{ ko: '불꽃', en: 'Fire' }, { ko: '격투', en: 'Fighting' }, { ko: '땅', en: 'Ground' }, { ko: '비행', en: 'Flying' }], correct: 0 },
  { q: { ko: '스텔스록으로 교체 등장 시 최대 HP의 50%를 잃는 타입 조합은?', en: 'Which typing loses 50% max HP to Stealth Rock on entry?' },
    opts: [{ ko: '불꽃·비행 (리자몽)', en: 'Fire/Flying (Charizard)' }, { ko: '물·비행 (갸라도스)', en: 'Water/Flying (Gyarados)' }, { ko: '드래곤·땅 (한카리아스)', en: 'Dragon/Ground (Garchomp)' }, { ko: '강철·페어리 (마기아나)', en: 'Steel/Fairy (Magearna)' }], correct: 0 },
  { q: { ko: '스텔스록이 주는 데미지의 산정 기준은?', en: 'How is Stealth Rock damage calculated?' },
    opts: [{ ko: '바위 타입 기술의 상성 배율에 비례', en: 'Proportional to Rock-type effectiveness against the Pokémon' }, { ko: '항상 최대 HP의 1/8 고정', en: 'Always a fixed 1/8 of max HP' }, { ko: '상대의 방어 종족값에 반비례', en: 'Inversely proportional to the target\'s Defense' }, { ko: '상대의 무게에 비례', en: 'Proportional to the target\'s weight' }], correct: 0 },

  // ─── ⑨ 스피드 종족값 · 종족값 라인 (5문항) ────────────────────────────────
  { q: { ko: '뮤츠의 스피드 종족값은?', en: 'What is Mewtwo\'s base Speed?' },
    opts: [{ ko: '130', en: '130' }, { ko: '120', en: '120' }, { ko: '140', en: '140' }, { ko: '110', en: '110' }], correct: 0 },
  { q: { ko: '한카리아스의 스피드 종족값은?(이른바 "102족")', en: 'What is Garchomp\'s base Speed (the famous "102 line")?' },
    opts: [{ ko: '102', en: '102' }, { ko: '100', en: '100' }, { ko: '108', en: '108' }, { ko: '95', en: '95' }], correct: 0 },
  { q: { ko: '종족값 총합이 720인 포켓몬은?', en: 'Which Pokémon has a base stat total of 720?' },
    opts: [{ ko: '아르세우스', en: 'Arceus' }, { ko: '뮤츠', en: 'Mewtwo' }, { ko: '레쿠쟈', en: 'Rayquaza' }, { ko: '기라티나', en: 'Giratina' }], correct: 0 },
  { q: { ko: '다음 중 종족값 총합이 680이 아닌 포켓몬은?', en: 'Which does NOT have a base stat total of 680?' },
    opts: [{ ko: '한카리아스', en: 'Garchomp' }, { ko: '뮤츠', en: 'Mewtwo' }, { ko: '루기아', en: 'Lugia' }, { ko: '칠색조', en: 'Ho-Oh' }], correct: 0 },
  { q: { ko: '스피드 종족값이 200으로 전 포켓몬 중 가장 빠른 포켓몬은?', en: 'Which Pokémon has the highest base Speed (200)?' },
    opts: [{ ko: '레지에레키', en: 'Regieleki' }, { ko: '마르마인', en: 'Electrode' }, { ko: '뮤츠', en: 'Mewtwo' }, { ko: '텅비드', en: 'Ninjask' }], correct: 0 },

  // ─── ⑩ 데미지 계산식 · 배틀 메커니즘 (8문항) ──────────────────────────────
  { q: { ko: '데미지 계산 시 적용되는 난수(랜덤 보정)의 범위는?', en: 'What is the random damage roll range in the damage formula?' },
    opts: [{ ko: '0.85 ~ 1.00', en: '0.85 – 1.00' }, { ko: '0.90 ~ 1.10', en: '0.90 – 1.10' }, { ko: '0.75 ~ 1.00', en: '0.75 – 1.00' }, { ko: '0.95 ~ 1.05', en: '0.95 – 1.05' }], correct: 0 },
  { q: { ko: '자속 보정(STAB)의 배율은?(테라스탈 미적용)', en: 'What is the STAB multiplier (without Terastallization)?' },
    opts: [{ ko: '1.5배', en: '1.5×' }, { ko: '1.25배', en: '1.25×' }, { ko: '2.0배', en: '2.0×' }, { ko: '1.3배', en: '1.3×' }], correct: 0 },
  { q: { ko: '원래 타입과 같은 타입으로 테라스탈했을 때 그 타입 기술의 자속 배율은?', en: 'If a Pokémon Terastallizes into its own original type, what is the STAB multiplier for that type?' },
    opts: [{ ko: '2.0배', en: '2.0×' }, { ko: '1.5배', en: '1.5×' }, { ko: '1.75배', en: '1.75×' }, { ko: '2.25배', en: '2.25×' }], correct: 0 },
  { q: { ko: '급소에 맞았을 때 무시되는 능력치 랭크 변화는?', en: 'Which stat stage changes are ignored on a critical hit?' },
    opts: [{ ko: '공격자의 공격 하락 랭크와 방어자의 방어 상승 랭크', en: 'Attacker\'s Attack drops and defender\'s Defense boosts' }, { ko: '모든 능력치 랭크 변화', en: 'All stat stage changes' }, { ko: '방어자의 방어 하락 랭크만', en: 'Only the defender\'s Defense drops' }, { ko: '공격자의 공격 상승 랭크만', en: 'Only the attacker\'s Attack boosts' }], correct: 0 },
  { q: { ko: '기술 "지구던지기"가 주는 데미지는?', en: 'How much damage does Seismic Toss deal?' },
    opts: [{ ko: '사용자의 레벨과 같은 고정 데미지', en: 'Fixed damage equal to the user\'s level' }, { ko: '상대 최대 HP의 절반', en: 'Half the target\'s max HP' }, { ko: '항상 40', en: 'Always 40' }, { ko: '상대 현재 HP의 절반', en: 'Half the target\'s current HP' }], correct: 0 },
  { q: { ko: '"하이드로펌프"의 위력과 명중률은?', en: 'What are Hydro Pump\'s base power and accuracy?' },
    opts: [{ ko: '위력 110 / 명중 80', en: '110 power / 80 accuracy' }, { ko: '위력 120 / 명중 70', en: '120 power / 70 accuracy' }, { ko: '위력 110 / 명중 70', en: '110 power / 70 accuracy' }, { ko: '위력 100 / 명중 80', en: '100 power / 80 accuracy' }], correct: 0 },
  { q: { ko: '"인파이트(Close Combat)" 사용 후 사용자가 겪는 부작용은?', en: 'What drawback does Close Combat inflict on the user?' },
    opts: [{ ko: '방어·특방이 1랭크씩 하락', en: 'Lowers the user\'s Defense and Sp. Def by 1 stage each' }, { ko: '다음 턴 행동 불가', en: 'The user must recharge next turn' }, { ko: '반동 데미지를 받는다', en: 'The user takes recoil damage' }, { ko: '공격이 1랭크 하락', en: 'Lowers the user\'s Attack by 1 stage' }], correct: 0 },
  { q: { ko: '능력치 랭크 +6단계일 때 적용되는 배율은?', en: 'What multiplier applies at +6 stat stages?' },
    opts: [{ ko: '4.0배', en: '4.0×' }, { ko: '3.0배', en: '3.0×' }, { ko: '2.5배', en: '2.5×' }, { ko: '6.0배', en: '6.0×' }], correct: 0 },
];

/** 은행 문항 → QuizQuestion(현지화). 보기 순서 셔플(정답이 항상 첫 보기로 고정되는 것 방지). */
export function bankToQuestion(index: number): QuizQuestion {
  const lang = curLang();
  const b = EXAM_BANK[index];
  // Fisher-Yates로 보기 인덱스 셔플 후 정답 위치 재계산.
  const order = b.opts.map((_, i) => i);
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  return {
    kind: 'flavor', // 은행 문항은 미디어 없는 지식형 — 렌더는 텍스트 지문+보기
    prompt: b.q[lang],
    answerType: 'choice',
    options: order.map(i => ({ label: b.opts[i][lang] })),
    correctIndex: order.indexOf(b.correct),
    reveal: { title: b.opts[b.correct][lang] },
  };
}
