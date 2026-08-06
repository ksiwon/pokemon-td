// src/data/achievements.ts
import { Achievement, AchievementTier, TIER_POINTS } from '../types/game';
import { SPECIAL_SYNERGY_DEFS } from '../utils/synergyManager';

export type AchievementCategory =
  | 'wave'
  | 'combat'
  | 'economy'
  | 'collect'
  | 'growth'
  | 'synergy'
  | 'challenge'
  | 'story'
  | 'multi';

export interface AchievementWithCategory extends Achievement {
  category: AchievementCategory;
}

// ─── 업적 생성 헬퍼 ──────────────────────────────────────────────────────────
const mkAch = (
  base: Omit<AchievementWithCategory,
    'progress' | 'unlocked' | 'reward' | 'completions' | 'totalPoints' | 'pointsPerCompletion'
  >
): AchievementWithCategory => ({
  ...base,
  // 번역 키를 명시하지 않은 개별 업적은 id에서 유도한다(`achData.item.<id>.name/desc`).
  // 73개에 손으로 키를 달면 id와 어긋날 여지가 생기므로 여기서 한 번에 묶는다.
  nameKey: base.nameKey ?? `achData.item.${base.id}.name`,
  descKey: base.descKey ?? `achData.item.${base.id}.desc`,
  progress: 0,
  unlocked: false,
  reward: 0,                                   // 골드 보상 폐지 → AP로 대체
  completions: 0,
  totalPoints: 0,
  pointsPerCompletion: TIER_POINTS[base.tier], // tier → 자동 산출
});

// ─── 포켓몬 18타입 ───────────────────────────────────────────────────────────
const ALL_TYPES: Array<{ key: string; nameKo: string; icon: string }> = [
  { key: 'normal',   nameKo: '노말',   icon: '⬜' },
  { key: 'fire',     nameKo: '불꽃',   icon: '🔥' },
  { key: 'water',    nameKo: '물',     icon: '💧' },
  { key: 'electric', nameKo: '전기',   icon: '⚡' },
  { key: 'grass',    nameKo: '풀',     icon: '🌿' },
  { key: 'ice',      nameKo: '얼음',   icon: '❄️' },
  { key: 'fighting', nameKo: '격투',   icon: '🥊' },
  { key: 'poison',   nameKo: '독',     icon: '☠️' },
  { key: 'ground',   nameKo: '땅',     icon: '🌍' },
  { key: 'flying',   nameKo: '비행',   icon: '🦅' },
  { key: 'psychic',  nameKo: '에스퍼', icon: '🔮' },
  { key: 'bug',      nameKo: '벌레',   icon: '🐛' },
  { key: 'rock',     nameKo: '바위',   icon: '🪨' },
  { key: 'ghost',    nameKo: '고스트', icon: '👻' },
  { key: 'dragon',   nameKo: '드래곤', icon: '🐉' },
  { key: 'dark',     nameKo: '악',     icon: '🌑' },
  { key: 'steel',    nameKo: '강철',   icon: '⚙️' },
  { key: 'fairy',    nameKo: '페어리', icon: '🌸' },
];

// ─── 타입 시너지 업적 (18타입 × 3단계 = 54개) ───────────────────────────────
// 2마리: Bronze(3pt) — 자주 달성 가능
// 4마리: Silver(10pt) — 약간 집중 필요
// 6마리: Gold(25pt)  — 한 타입만 집중해야 달성
const typeSynergyAchievements: AchievementWithCategory[] = ALL_TYPES.flatMap(t => [
  mkAch({
    id: `syn_type_${t.key}_2`,
    name: `${t.nameKo} 듀오`,
    description: `${t.nameKo} 타입 포켓몬 2마리 배치`,
    nameKey: 'achData.synType.name2',
    descKey: 'achData.synType.desc2',
    i18nRefs: { type: `types.${t.key}` },
    icon: t.icon,
    category: 'synergy',
    condition: `synergy_type_${t.key}_2`,
    target: 1,
    tier: 'bronze',
  }),
  mkAch({
    id: `syn_type_${t.key}_4`,
    name: `${t.nameKo} 쿼텟`,
    description: `${t.nameKo} 타입 포켓몬 4마리 배치`,
    nameKey: 'achData.synType.name4',
    descKey: 'achData.synType.desc4',
    i18nRefs: { type: `types.${t.key}` },
    icon: t.icon,
    category: 'synergy',
    condition: `synergy_type_${t.key}_4`,
    target: 1,
    tier: 'silver',
  }),
  mkAch({
    id: `syn_type_${t.key}_6`,
    name: `${t.nameKo} 군단`,
    description: `${t.nameKo} 타입 6마리 풀 시너지 달성`,
    nameKey: 'achData.synType.name6',
    descKey: 'achData.synType.desc6',
    i18nRefs: { type: `types.${t.key}` },
    icon: t.icon,
    category: 'synergy',
    condition: `synergy_type_${t.key}_6`,
    target: 1,
    tier: 'gold',
  }),
]);

// ─── 세대 시너지 업적 (9세대 × 3단계 = 27개) ────────────────────────────────
const GEN_NAMES: Record<number, string> = {
  1: '1세대(관동)', 2: '2세대(성도)', 3: '3세대(호연)',
  4: '4세대(신오)', 5: '5세대(하나)', 6: '6세대(칼로스)',
  7: '7세대(알로라)', 8: '8세대(가라르)', 9: '9세대(팔데아)',
};
const GEN_ICONS: Record<number, string> = {
  1:'🕹️', 2:'🌟', 3:'🌊', 4:'💎', 5:'🦸', 6:'🗼', 7:'🌺', 8:'👑', 9:'🌐',
};

const genSynergyAchievements: AchievementWithCategory[] = Array.from({ length: 9 }, (_, i) => i + 1).flatMap(gen => [
  mkAch({
    id: `syn_gen_${gen}_2`,
    name: `${GEN_NAMES[gen]} 콤비`,
    description: `${gen}세대 포켓몬 2마리 배치`,
    nameKey: 'achData.synGen.name2',
    descKey: 'achData.synGen.desc2',
    i18nRefs: { gen: `achData.genLabel.${gen}` },
    i18nParams: { n: gen },
    icon: GEN_ICONS[gen],
    category: 'synergy',
    condition: `synergy_gen_${gen}_2`,
    target: 1,
    tier: 'bronze',
  }),
  mkAch({
    id: `syn_gen_${gen}_4`,
    name: `${GEN_NAMES[gen]} 파티`,
    description: `${gen}세대 포켓몬 4마리 배치`,
    nameKey: 'achData.synGen.name4',
    descKey: 'achData.synGen.desc4',
    i18nRefs: { gen: `achData.genLabel.${gen}` },
    i18nParams: { n: gen },
    icon: GEN_ICONS[gen],
    category: 'synergy',
    condition: `synergy_gen_${gen}_4`,
    target: 1,
    tier: 'silver',
  }),
  mkAch({
    id: `syn_gen_${gen}_6`,
    name: `${GEN_NAMES[gen]} 올스타`,
    description: `${gen}세대 포켓몬 6마리 풀 시너지 달성`,
    nameKey: 'achData.synGen.name6',
    descKey: 'achData.synGen.desc6',
    i18nRefs: { gen: `achData.genLabel.${gen}` },
    i18nParams: { n: gen },
    icon: GEN_ICONS[gen],
    category: 'synergy',
    condition: `synergy_gen_${gen}_6`,
    target: 1,
    tier: 'gold',
  }),
]);

// ─── 특수 시너지 업적 (SPECIAL_SYNERGY_DEFS 기반) ────────────────────────────
// 포켓몬 수(조합 난이도)에 따라 Gold/Diamond 배분:
//  ≤ 3종 (전설의 새/개, 라티 등 소규모)      → Gold(25pt)
//  4~6종 (카푸, 성검사, UB 등)               → Gold(25pt)
//  7+종 (지우 팀, 화석, 베이비 등 대규모)    → Diamond(50pt)
const specialSynergyAchievements: AchievementWithCategory[] = SPECIAL_SYNERGY_DEFS.map(def => {
  const key = def.id.replace('special:', '');
  const n = def.pokemonIds.length;
  const tier: AchievementTier = n >= 7 ? 'diamond' : 'gold';
  return mkAch({
    id: `syn_special_${key}`,
    name: def.name,
    description: `${def.name} 시너지 발동 (2마리 이상 동시 배치)`,
    // 이름은 시너지 패널과 같은 출처(synergyData)를 쓴다 — 표기가 갈리면 안 된다.
    nameKey: `synergyData.${key}.name`,
    descKey: 'achData.synSpecial.desc',
    i18nRefs: { name: `synergyData.${key}.name` },
    icon: def.icon,
    category: 'synergy',
    condition: `special_synergy_${key}`,
    target: 1,
    tier,
  });
});

// ─── 고정 업적 ───────────────────────────────────────────────────────────────
const fixedAchievements: AchievementWithCategory[] = [

  // ══════════════════ 🌊 진행 (WAVE) ══════════════════
  // 매판 달성 가능 수준 → Bronze / Silver
  mkAch({ id: 'wave3',  name: '생존자',      description: '웨이브 3 도달',         icon: '🌱', category: 'wave', condition: 'wave', target: 3,  tier: 'bronze' }),
  mkAch({ id: 'wave5',  name: '첫 걸음',     description: '웨이브 5 도달',         icon: '🌿', category: 'wave', condition: 'wave', target: 5,  tier: 'bronze' }),
  mkAch({ id: 'wave10', name: '초보 탈출',   description: '웨이브 10 도달',        icon: '🌳', category: 'wave', condition: 'wave', target: 10, tier: 'bronze' }),
  mkAch({ id: 'wave20', name: '중급자',      description: '웨이브 20 도달',        icon: '⚔️', category: 'wave', condition: 'wave', target: 20, tier: 'silver' }),
  mkAch({ id: 'wave30', name: '고급자',      description: '웨이브 30 도달',        icon: '🏆', category: 'wave', condition: 'wave', target: 30, tier: 'silver' }),
  mkAch({ id: 'wave40', name: '베테랑',      description: '웨이브 40 도달',        icon: '🌟', category: 'wave', condition: 'wave', target: 40, tier: 'gold'   }),
  mkAch({ id: 'wave50', name: '마스터',      description: '웨이브 50 클리어!',     icon: '👑', category: 'wave', condition: 'wave', target: 50, tier: 'gold',   hidden: false }),

  // ══════════════════ ⚔️ 전투 (COMBAT) ══════════════════
  // 처치 수 누적 → Bronze~Silver, 보스 처치는 Silver~Gold
  mkAch({ id: 'kill50',   name: '신참 사냥꾼',  description: '적 50마리 처치',    icon: '⚔️', category: 'combat', condition: 'kills', target: 50,   tier: 'bronze' }),
  mkAch({ id: 'kill100',  name: '사냥꾼',       description: '적 100마리 처치',   icon: '🗡️', category: 'combat', condition: 'kills', target: 100,  tier: 'bronze' }),
  mkAch({ id: 'kill300',  name: '베테랑 사냥꾼',description: '적 300마리 처치',   icon: '💀', category: 'combat', condition: 'kills', target: 300,  tier: 'silver' }),
  mkAch({ id: 'kill500',  name: '학살자',       description: '적 500마리 처치',   icon: '☠️', category: 'combat', condition: 'kills', target: 500,  tier: 'silver' }),
  mkAch({ id: 'kill1000', name: '전쟁의 신',    description: '적 1000마리 처치',  icon: '💥', category: 'combat', condition: 'kills', target: 1000, tier: 'gold',   hidden: true }),
  mkAch({ id: 'boss1',    name: '보스 사냥 시작',description: '보스 1마리 처치',  icon: '🎯', category: 'combat', condition: 'boss',  target: 1,    tier: 'bronze' }),
  mkAch({ id: 'boss5',    name: '보스 헌터',    description: '보스 5마리 처치',   icon: '🔥', category: 'combat', condition: 'boss',  target: 5,    tier: 'silver' }),
  mkAch({ id: 'boss15',   name: '보스 킬러',    description: '보스 15마리 처치',  icon: '💎', category: 'combat', condition: 'boss',  target: 15,   tier: 'gold'   }),
  mkAch({ id: 'boss30',   name: '보스 학살자',  description: '보스 30마리 처치',  icon: '👑', category: 'combat', condition: 'boss',  target: 30,   tier: 'diamond', hidden: true }),
  mkAch({ id: 'crit_kill',name: '급소 한 방',   description: '크리티컬로 보스 처치', icon: '⚡', category: 'combat', condition: 'crit_boss', target: 1, tier: 'silver' }),
  mkAch({ id: 'combo10',  name: '콤보의 신',    description: '웨이브 중 10콤보 달성', icon: '🔗', category: 'combat', condition: 'combo', target: 10, tier: 'bronze' }),
  mkAch({ id: 'combo20',  name: '연속 학살',    description: '웨이브 중 20콤보 달성', icon: '🌀', category: 'combat', condition: 'combo', target: 20, tier: 'silver' }),

  // ══════════════════ 💰 경제 (ECONOMY) ══════════════════
  // 골드 수급은 매판 반복 → Bronze~Silver
  mkAch({ id: 'money5k',   name: '알뜰살뜰',    description: '한 게임에서 총 5,000원 획득',    icon: '💰', category: 'economy', condition: 'money', target: 5000,   tier: 'bronze' }),
  mkAch({ id: 'money20k',  name: '부자',         description: '한 게임에서 총 20,000원 획득',   icon: '💎', category: 'economy', condition: 'money', target: 20000,  tier: 'silver' }),
  mkAch({ id: 'money50k',  name: '재벌',         description: '한 게임에서 총 50,000원 획득',   icon: '🤑', category: 'economy', condition: 'money', target: 50000,  tier: 'gold',   hidden: true }),
  mkAch({ id: 'sell5',     name: '거래 입문',    description: '포켓몬 5마리 판매',              icon: '🏪', category: 'economy', condition: 'sell',  target: 5,      tier: 'bronze' }),
  mkAch({ id: 'sell20',    name: '거래의 달인',  description: '포켓몬 20마리 판매',             icon: '📈', category: 'economy', condition: 'sell',  target: 20,     tier: 'silver' }),
  mkAch({ id: 'sell50',    name: '포켓몬 브로커',description: '포켓몬 50마리 판매',             icon: '🏦', category: 'economy', condition: 'sell',  target: 50,     tier: 'gold',   hidden: true }),
  mkAch({ id: 'thrifty',   name: '절약가',       description: '웨이브 5을 골드 100 미만으로 클리어', icon: '🪙', category: 'economy', condition: 'thrifty', target: 1, tier: 'silver' }),

  // ══════════════════ 📚 수집 (COLLECT) ══════════════════
  // 도감 수집은 장기 목표 → Silver~Gold
  mkAch({ id: 'allstarters',name: '스타터 트리오', description: '이상해씨, 파이리, 꼬부기 모두 수집', icon: '🔰', category: 'collect', condition: 'starters', target: 1, tier: 'silver' }),

  mkAch({ id: 'legendary',  name: '전설의 트레이너',description: '전설 포켓몬 수집',  icon: '✨', category: 'collect', condition: 'legendary', target: 1, tier: 'gold', hidden: true }),
  mkAch({ id: 'all_types',  name: '타입 컬렉터',   description: '18종 타입을 모두 보유한 적 있음', icon: '🌈', category: 'collect', condition: 'all_types', target: 1, tier: 'gold' }),

  // ══════════════════ 🧬 성장 (GROWTH) ══════════════════
  // 진화/메가진화는 플레이마다 가능 → Bronze~Gold
  mkAch({ id: 'evolve1',   name: '첫 진화',      description: '포켓몬 1마리 진화',          icon: '🦋', category: 'growth', condition: 'evolve',      target: 1,  tier: 'bronze' }),
  mkAch({ id: 'evolve5',   name: '진화 입문',    description: '포켓몬 5마리 진화',          icon: '🌟', category: 'growth', condition: 'evolve',      target: 5,  tier: 'bronze' }),
  mkAch({ id: 'evolve20',  name: '진화 마니아',  description: '포켓몬 20마리 진화',         icon: '🔮', category: 'growth', condition: 'evolve',      target: 20, tier: 'silver' }),
  mkAch({ id: 'evolve50',  name: '진화의 달인',  description: '포켓몬 50마리 진화',         icon: '💫', category: 'growth', condition: 'evolve',      target: 50, tier: 'gold',   hidden: true }),
  mkAch({ id: 'mega1',     name: '메가진화!',    description: '메가진화 1회 달성',          icon: '💥', category: 'growth', condition: 'mega',        target: 1,  tier: 'silver' }),
  mkAch({ id: 'mega5',     name: '메가 파워',    description: '메가진화 5회 달성',          icon: '🌠', category: 'growth', condition: 'mega',        target: 5,  tier: 'gold'   }),
  mkAch({ id: 'gigamax1',  name: '거다이맥스!',  description: '거다이맥스 1회 달성',        icon: '⚡', category: 'growth', condition: 'gigamax',     target: 1,  tier: 'silver' }),
  mkAch({ id: 'fusion1',   name: '신화의 합체',  description: '포켓몬 합체 1회 달성',       icon: '🔗', category: 'growth', condition: 'fusion',      target: 1,  tier: 'gold'   }),
  mkAch({ id: 'level50',   name: '레벨 50',      description: '포켓몬을 레벨 50으로 성장',  icon: '5️⃣0️⃣', category: 'growth', condition: 'level50',    target: 1,  tier: 'bronze' }),
  mkAch({ id: 'level100',  name: '레벨 MAX!',    description: '포켓몬을 레벨 100으로 성장', icon: '💯', category: 'growth', condition: 'level100',    target: 1,  tier: 'silver' }),
  mkAch({ id: 'max_team',  name: '최강 전대',    description: '포켓몬 6마리 모두 레벨 50+', icon: '🤝', category: 'growth', condition: 'team_level50', target: 1, tier: 'gold'   }),

  // ══════════════════ 🔥 시너지 공통 (SYNERGY) ══════════════════
  mkAch({ id: 'synergy_any',    name: '시너지 입문',   description: '시너지 1가지 이상 활성화',    icon: '🔗', category: 'synergy', condition: 'synergy_any',   target: 1, tier: 'bronze' }),
  mkAch({ id: 'synergy_multi3', name: '복합 전략가',   description: '시너지 3가지 동시 활성화',    icon: '🧩', category: 'synergy', condition: 'synergy_multi', target: 3, tier: 'silver' }),
  mkAch({ id: 'synergy_multi5', name: '시너지 마스터', description: '시너지 5가지 동시 활성화',    icon: '🎭', category: 'synergy', condition: 'synergy_multi', target: 5, tier: 'gold',   hidden: true }),
  mkAch({ id: 'synergy_lv3',    name: '최대 시너지',   description: '한 시너지를 최대 레벨(6마리)로 달성', icon: '🌋', category: 'synergy', condition: 'synergy_max', target: 1, tier: 'silver' }),

  // ══════════════════ 🎯 도전 (CHALLENGE) ══════════════════
  // 퍼펙트/스피드런/고난도 → Diamond~Legendary
  mkAch({ id: 'perfect',       name: '완벽한 방어',    description: '라이프 손실 없이 웨이브 10 클리어',        icon: '🛡️', category: 'challenge', condition: 'perfect10',    target: 1, tier: 'silver'   }),
  mkAch({ id: 'perfect30',     name: '철벽',           description: '라이프 손실 없이 웨이브 30 클리어',        icon: '🏰', category: 'challenge', condition: 'perfect30',    target: 1, tier: 'diamond',  hidden: true }),
  mkAch({ id: 'perfect50',     name: '무결점 방어선',  description: '라이프 50 유지로 웨이브 50 클리어',        icon: '✨', category: 'challenge', condition: 'perfect50',    target: 1, tier: 'legendary', hidden: true }),
  mkAch({ id: 'nofaint10',     name: '불굴의 의지',    description: '포켓몬 기절 없이 웨이브 10 클리어',        icon: '💪', category: 'challenge', condition: 'nofaint10',    target: 1, tier: 'silver'   }),
  mkAch({ id: 'nolosses',      name: '불패신화',       description: '포켓몬 기절 없이 웨이브 30 도달',          icon: '🏅', category: 'challenge', condition: 'noloss30',     target: 1, tier: 'diamond',  hidden: true }),
  mkAch({ id: 'speedrun',      name: '스피드러너',     description: '웨이브 20을 30분 안에 클리어',             icon: '⚡', category: 'challenge', condition: 'speedrun',     target: 1, tier: 'gold',     hidden: true }),
  mkAch({ id: 'speed50',       name: '50파 스피드런',  description: '웨이브 50을 60분 안에 클리어',             icon: '🚀', category: 'challenge', condition: 'speed50',      target: 1, tier: 'legendary', hidden: true }),
  mkAch({ id: 'hard_clear',    name: '도전자',         description: 'Hard 난이도 웨이브 30 클리어',             icon: '🔱', category: 'challenge', condition: 'hard_clear',   target: 1, tier: 'gold'     }),
  mkAch({ id: 'expert_clear',  name: '전문가',         description: 'Expert 난이도 웨이브 30 클리어',           icon: '💎', category: 'challenge', condition: 'expert_clear', target: 1, tier: 'diamond',  hidden: true }),
  mkAch({ id: 'all_maps',      name: '탐험가',         description: '모든 맵에서 웨이브 20 이상 도달',          icon: '🗺️', category: 'challenge', condition: 'all_maps',     target: 1, tier: 'gold'     }),
  mkAch({ id: 'no_item',       name: '맨몸 클리어',    description: '아이템 미사용으로 웨이브 20 클리어',       icon: '🤲', category: 'challenge', condition: 'no_item',      target: 1, tier: 'diamond',  hidden: true }),
  mkAch({ id: 'solo_type',     name: '단일 타입 전략', description: '같은 타입 포켓몬만으로 웨이브 20 도달',   icon: '🎯', category: 'challenge', condition: 'mono_type',    target: 1, tier: 'gold'     }),
  mkAch({ id: 'legendary_trio',name: '전설의 시작',    description: '1세대 전설 포켓몬 3종 동시 배치',         icon: '🌈', category: 'challenge', condition: 'legendary_trio', target: 1, tier: 'gold' }),

  // ══════════════════ 👥 멀티플레이 (MULTI) ══════════════════
  mkAch({ id: 'multi_first_win', name: '첫 승리',     description: '멀티플레이 첫 승리',          icon: '🏆', category: 'multi', condition: 'multi_win', target: 1,    tier: 'silver'  }),
  mkAch({ id: 'multi_5wins',     name: '승부사',      description: '멀티플레이 5승',              icon: '🥇', category: 'multi', condition: 'multi_win', target: 5,    tier: 'gold'    }),
  mkAch({ id: 'multi_20wins',    name: '지배자',      description: '멀티플레이 20승',             icon: '👑', category: 'multi', condition: 'multi_win', target: 20,   tier: 'diamond' }),
  mkAch({ id: 'multi_50wins',    name: '최강자',      description: '멀티플레이 50승',             icon: '🌍', category: 'multi', condition: 'multi_win', target: 50,   tier: 'legendary', hidden: true }),
  mkAch({ id: 'rating1000',      name: '실버 등급',   description: '레이팅 1000 달성',            icon: '🥈', category: 'multi', condition: 'rating',    target: 1000, tier: 'silver'  }),
  mkAch({ id: 'rating1200',      name: '골드 등급',   description: '레이팅 1200 달성',            icon: '🌟', category: 'multi', condition: 'rating',    target: 1200, tier: 'gold'    }),
  mkAch({ id: 'rating1500',      name: '다이아 등급', description: '레이팅 1500 달성',            icon: '💎', category: 'multi', condition: 'rating',    target: 1500, tier: 'diamond', hidden: true }),
  mkAch({ id: 'rating1800',      name: '전설 등급',   description: '레이팅 1800 달성',            icon: '👑', category: 'multi', condition: 'rating',    target: 1800, tier: 'legendary', hidden: true }),
];

// ─── 스토리 모드 업적 (8체육관 = 8챕터, 클리어 시 1개씩) ──────────────────────
// AchievementService.onStoryClear(chapterNumber)에서 `story_ch{n}` id로 갱신.
const storyAchievements: AchievementWithCategory[] = [
  mkAch({ id: 'story_ch1', name: '도라지시티 탈환',         description: '스토리 1챕터 "눈을 떠보니 귀뚤뚜기" 클리어 (비행 타입)',   icon: '🦅', category: 'story', condition: 'story_clear_ch1', target: 1, tier: 'bronze' }),
  mkAch({ id: 'story_ch2', name: '고동마을 탈환',           description: '스토리 2챕터 "벌레의 마을, 그리고 깃털" 클리어 (벌레 타입)', icon: '🐛', category: 'story', condition: 'story_clear_ch2', target: 1, tier: 'bronze' }),
  mkAch({ id: 'story_ch3', name: '금빛시티 탈환',           description: '스토리 3챕터 "구르기, 그리고 난입" 클리어 (노말 타입)',     icon: '⬜', category: 'story', condition: 'story_clear_ch3', target: 1, tier: 'silver' }),
  mkAch({ id: 'story_ch4', name: '인주시티 탈환',           description: '스토리 4챕터 "탑에서 새어나오는 빛" 클리어 (고스트 타입)',   icon: '👻', category: 'story', condition: 'story_clear_ch4', target: 1, tier: 'silver' }),
  mkAch({ id: 'story_ch5', name: '진청시티 탈환',           description: '스토리 5챕터 "먹물 한 발의 등장" 클리어 (격투 타입)',       icon: '🥊', category: 'story', condition: 'story_clear_ch5', target: 1, tier: 'gold' }),
  mkAch({ id: 'story_ch6', name: '담청시티 탈환',           description: '스토리 6챕터 "일곱 빛이 모이다" 클리어 (강철 타입)',       icon: '⚙️', category: 'story', condition: 'story_clear_ch6', target: 1, tier: 'gold' }),
  mkAch({ id: 'story_ch7', name: '황토마을 탈환',           description: '스토리 7챕터 클리어 — 눈보라의 엄니 야생 메꾸리 격파 (얼음 타입)', icon: '❄️', category: 'story', condition: 'story_clear_ch7', target: 1, tier: 'diamond' }),
  mkAch({ id: 'story_ch8', name: '성도 해방 — 검은먹시티 탈환', description: '스토리 최종 챕터 클리어 — 심해의 용 야생 킹드라 격파 (드래곤 타입)', icon: '🐉', category: 'story', condition: 'story_clear_ch8', target: 1, tier: 'legendary' }),
];

// ─── 최종 목록 ───────────────────────────────────────────────────────────────
export const ACHIEVEMENTS: AchievementWithCategory[] = [
  ...fixedAchievements,
  ...typeSynergyAchievements,
  ...genSynergyAchievements,
  ...specialSynergyAchievements,
  ...storyAchievements,
];

/** id → 업적 정의. 세이브에 굳은 값 대신 항상 여기서 문구를 가져오기 위한 조회용. */
const ACHIEVEMENTS_BY_ID = new Map(ACHIEVEMENTS.map(a => [a.id, a]));
export const getAchievementById = (id: string): AchievementWithCategory | undefined =>
  ACHIEVEMENTS_BY_ID.get(id);

type TFn = (key: string, params?: Record<string, string | number>) => string;

/**
 * 업적 이름/설명을 현재 언어로 해석한다.
 *
 * ⚠ 세이브에는 `{...base}`로 복사된 **한국어 name이 굳어** 저장된다
 * (SaveService.updateAchievement). 그래서 저장된 객체의 name을 그대로 쓰면
 * 번역을 해도 한국어가 남는다 — 반드시 이 함수로 키를 통해 풀어야 한다.
 * 키가 없거나 번역이 비면 원본 한국어로 폴백한다(구버전 세이브 안전망).
 */
export const resolveAchievementText = (
  ach: Pick<Achievement, 'name' | 'description' | 'nameKey' | 'descKey' | 'i18nParams' | 'i18nRefs'>,
  t: TFn,
  field: 'name' | 'desc',
): string => {
  const key = field === 'name' ? ach.nameKey : ach.descKey;
  const fallback = field === 'name' ? ach.name : ach.description;
  if (!key) return fallback;

  const params: Record<string, string | number> = { ...(ach.i18nParams ?? {}) };
  for (const [name, refKey] of Object.entries(ach.i18nRefs ?? {})) {
    const resolved = t(refKey);
    params[name] = resolved === refKey ? fallback : resolved;
  }

  const out = t(key, params);
  return out === key ? fallback : out;
};

// ─── 카테고리 메타데이터 ──────────────────────────────────────────────────────
export const ACHIEVEMENT_CATEGORIES: Record<AchievementCategory, { label: string; icon: string }> = {
  wave:      { label: '진행',       icon: '🌊' },
  combat:    { label: '전투',       icon: '⚔️' },
  economy:   { label: '경제',       icon: '💰' },
  collect:   { label: '수집',       icon: '📚' },
  growth:    { label: '성장',       icon: '🧬' },
  synergy:   { label: '시너지',     icon: '🔥' },
  challenge: { label: '도전',       icon: '🎯' },
  story:     { label: '스토리',     icon: '📖' },
  multi:     { label: '멀티플레이', icon: '👥' },
};

// ─── 티어 메타데이터 ──────────────────────────────────────────────────────────
export const TIER_META: Record<string, { label: string; color: string; bg: string; border: string }> = {
  bronze:    { label: '🥉 Bronze',    color: '#cd7f32', bg: 'rgba(205,127,50,0.10)', border: 'rgba(205,127,50,0.40)' },
  silver:    { label: '🥈 Silver',    color: '#c0c0c0', bg: 'rgba(192,192,192,0.10)', border: 'rgba(192,192,192,0.40)' },
  gold:      { label: '🥇 Gold',      color: '#FFD700', bg: 'rgba(255,215,0,0.10)',   border: 'rgba(255,215,0,0.45)'   },
  diamond:   { label: '💎 Diamond',   color: '#b9f2ff', bg: 'rgba(185,242,255,0.10)', border: 'rgba(185,242,255,0.45)' },
  legendary: { label: '👑 Legendary', color: '#ff80ff', bg: 'rgba(255,128,255,0.10)', border: 'rgba(255,128,255,0.45)' },
};