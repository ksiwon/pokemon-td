// src/services/QuizEngine.ts
// 퀴즈 문제 생성기. PokeAPI(getPokemon)로 현지화 이름·타입·스탯을 얻고,
// 공식아트 URL은 도감번호로 결정적 생성(추가 요청 0). 오답 보기 생성·셔플 포함.

import { pokeAPI } from '../api/pokeapi';
import { QuizKind, QuizQuestion, QuizOption } from '../types/quiz';

/** 전국도감 최대 번호(9세대 기준). 폼(10001+)은 제외. */
const MAX_DEX = 1025;

const TYPE_SLUGS = [
  'normal', 'fire', 'water', 'electric', 'grass', 'ice', 'fighting', 'poison', 'ground',
  'flying', 'psychic', 'bug', 'rock', 'ghost', 'dragon', 'dark', 'steel', 'fairy',
];

/** 공식 아트워크 URL(앱 전역과 동일 패턴). id만으로 결정적 생성. */
const artUrl = (id: number) =>
  `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/${id}.png`;

const dexLabel = (id: number) => `#${String(id).padStart(4, '0')}`;

/** 1..MAX_DEX 랜덤 도감번호. */
function randDexId(): number {
  return Math.floor(Math.random() * MAX_DEX) + 1;
}

/** exclude에 없는 서로 다른 랜덤 도감번호 n개. */
function pickDistinctIds(n: number, exclude: Set<number>): number[] {
  const out: number[] = [];
  const used = new Set(exclude);
  while (out.length < n) {
    const id = randDexId();
    if (used.has(id)) continue;
    used.add(id);
    out.push(id);
  }
  return out;
}

function shuffle<T>(arr: T[]): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const statTotal = (s: { hp: number; attack: number; defense: number; specialAttack: number; specialDefense: number; speed: number }) =>
  s.hp + s.attack + s.defense + s.specialAttack + s.specialDefense + s.speed;

/** 제너레이터 컨텍스트 — 지문/타입 라벨 현지화용 t만 주입. */
export interface QuizCtx {
  t: (key: string, params?: Record<string, string | number>) => string;
}

// ─── 종목별 생성기 ─────────────────────────────────────────────────────────────

/** 🕶 누구게 — 실루엣 보고 이름 4지선다. */
async function genSilhouette(ctx: QuizCtx): Promise<QuizQuestion> {
  const id = randDexId();
  const mon = await pokeAPI.getPokemon(id);
  const distractorIds = pickDistinctIds(3, new Set([id]));
  const distractors = await Promise.all(distractorIds.map(d => pokeAPI.getPokemon(d)));

  const tagged = [
    { label: mon.displayName, correct: true },
    ...distractors.map(d => ({ label: d.displayName, correct: false })),
  ];
  const opts = shuffle(tagged);

  return {
    kind: 'silhouette',
    prompt: ctx.t('quiz.play.silhouettePrompt'),
    media: { imageUrl: artUrl(id), silhouette: true },
    options: opts.map(o => ({ label: o.label } as QuizOption)),
    correctIndex: opts.findIndex(o => o.correct),
    reveal: { title: mon.displayName, subtitle: dexLabel(id), imageUrl: artUrl(id) },
  };
}

/** ⚔ 종족값 대결 — 둘 중 총합 높은 쪽. */
async function genBstDuel(ctx: QuizCtx): Promise<QuizQuestion> {
  let a = randDexId();
  let b = randDexId();
  while (b === a) b = randDexId();

  let [monA, monB] = await Promise.all([pokeAPI.getPokemon(a), pokeAPI.getPokemon(b)]);
  let totA = statTotal(monA.stats);
  let totB = statTotal(monB.stats);

  // 동점이면 b를 한 번 다시 뽑아 무승부 회피(희박).
  if (totA === totB) {
    let nb = randDexId();
    while (nb === a) nb = randDexId();
    b = nb;
    monB = await pokeAPI.getPokemon(b);
    totB = statTotal(monB.stats);
  }

  const correctIndex = totA >= totB ? 0 : 1;
  const winner = correctIndex === 0 ? monA : monB;
  const winTot = Math.max(totA, totB);

  return {
    kind: 'bstDuel',
    prompt: ctx.t('quiz.play.bstDuelPrompt'),
    options: [
      { label: monA.displayName, imageUrl: artUrl(a) },
      { label: monB.displayName, imageUrl: artUrl(b) },
    ],
    correctIndex,
    reveal: {
      title: ctx.t('quiz.play.bstRevealWin', { name: winner.displayName, total: winTot }),
      subtitle: `${monA.displayName} ${totA} · ${monB.displayName} ${totB}`,
      imageUrl: artUrl(correctIndex === 0 ? a : b),
    },
  };
}

/** 🧩 타입 — 포켓몬 보고 실제 타입 고르기(오답=미보유 타입). */
async function genType(ctx: QuizCtx): Promise<QuizQuestion> {
  const id = randDexId();
  const mon = await pokeAPI.getPokemon(id);
  const monTypes = mon.types.length ? mon.types : ['normal'];
  const correctType = monTypes[0];
  const wrong = shuffle(TYPE_SLUGS.filter(ty => !monTypes.includes(ty))).slice(0, 3);
  const opts = shuffle([correctType, ...wrong]);

  return {
    kind: 'type',
    prompt: ctx.t('quiz.play.typePrompt', { name: mon.displayName }),
    media: { imageUrl: artUrl(id) },
    options: opts.map(ty => ({ label: ctx.t(`types.${ty}`) } as QuizOption)),
    correctIndex: opts.indexOf(correctType),
    reveal: {
      title: mon.displayName,
      subtitle: monTypes.map(ty => ctx.t(`types.${ty}`)).join(' / '),
      imageUrl: artUrl(id),
    },
  };
}

/** 🔢 도감번호 — 포켓몬 보고 전국도감 번호 고르기. */
async function genDexNumber(ctx: QuizCtx): Promise<QuizQuestion> {
  const id = randDexId();
  const mon = await pokeAPI.getPokemon(id);
  const distractors = pickDistinctIds(3, new Set([id]));
  const nums = shuffle([id, ...distractors]);

  return {
    kind: 'dexNumber',
    prompt: ctx.t('quiz.play.dexPrompt', { name: mon.displayName }),
    media: { imageUrl: artUrl(id) },
    options: nums.map(n => ({ label: dexLabel(n) } as QuizOption)),
    correctIndex: nums.indexOf(id),
    reveal: { title: mon.displayName, subtitle: dexLabel(id), imageUrl: artUrl(id) },
  };
}

const GENERATORS: Record<QuizKind, (ctx: QuizCtx) => Promise<QuizQuestion>> = {
  silhouette: genSilhouette,
  bstDuel: genBstDuel,
  type: genType,
  dexNumber: genDexNumber,
};

/** 한 문제 생성. 네트워크 실패 시 throw(호출부에서 재시도 처리). */
export function generateQuestion(kind: QuizKind, ctx: QuizCtx): Promise<QuizQuestion> {
  return GENERATORS[kind](ctx);
}
