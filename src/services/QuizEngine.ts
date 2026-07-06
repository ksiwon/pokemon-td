// src/services/QuizEngine.ts
// 퀴즈 문제 생성기. PokeAPI(getPokemon)로 현지화 이름·타입·스탯을 얻고,
// 공식아트 URL은 도감번호로 결정적 생성(추가 요청 0). 오답 보기 생성·셔플 포함.

import { pokeAPI } from '../api/pokeapi';
import { QuizKind, QuizQuestion, QuizOption, QUIZ_KINDS } from '../types/quiz';
import { EXAM_BANK, bankToQuestion } from './quizExamBank';

/** 전국도감 최대 번호(9세대 기준). 폼(10001+)은 제외. */
const MAX_DEX = 1025;

const TYPE_SLUGS = [
  'normal', 'fire', 'water', 'electric', 'grass', 'ice', 'fighting', 'poison', 'ground',
  'flying', 'psychic', 'bug', 'rock', 'ghost', 'dragon', 'dark', 'steel', 'fairy',
];

/** 공식 아트워크 URL(앱 전역과 동일 패턴). id만으로 결정적 생성. */
const artUrl = (id: number) =>
  `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/${id}.png`;

/** 울음소리(.ogg) URL. PokeAPI cries CDN, id만으로 결정적 생성. */
const cryUrl = (id: number) =>
  `https://raw.githubusercontent.com/PokeAPI/cries/main/cries/pokemon/latest/${id}.ogg`;

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

/**
 * 문제에 쓰이는 이미지들을 미리 디코드까지 로드. 로드가 끝나야 문제를 반환 →
 * 화면에 빈 이미지가 뜨는 것 방지. 깨진/느린 이미지가 퀴즈를 막지 않도록
 * 개별 onerror + 전체 8초 안전 타임아웃.
 */
function preloadImages(urls: string[]): Promise<void> {
  const uniq = Array.from(new Set(urls.filter(Boolean)));
  if (uniq.length === 0) return Promise.resolve();
  const loads = uniq.map(url => new Promise<void>(resolve => {
    const img = new Image();
    img.onload = () => resolve();
    img.onerror = () => resolve();
    img.src = url;
  }));
  const timeout = new Promise<void>(resolve => setTimeout(resolve, 8000));
  return Promise.race([Promise.all(loads).then(() => undefined), timeout]);
}

/** 제너레이터 컨텍스트 — 지문/타입 라벨 현지화용 t만 주입. */
export interface QuizCtx {
  t: (key: string, params?: Record<string, string | number>) => string;
}

/** 주관식 채점 정규화 — 소문자화 + 공백/구분기호 제거(띄어쓰기·기호 무관). */
export function normalizeAnswer(s: string): string {
  return (s || '').normalize('NFC').toLowerCase().replace(/[\s·・.\-'’ㆍ_/]/g, '').trim();
}

/** 이름 맞히기 인정 정답 후보(현지화명 + 영문 slug). */
function acceptNames(mon: { displayName: string; name: string }): string[] {
  return Array.from(new Set([mon.displayName, mon.name].filter(Boolean)));
}

// ─── 종목별 생성기 ─────────────────────────────────────────────────────────────

/** 🕶 누구게 — 실루엣 보고 이름. choice=false면 주관식. */
async function genSilhouette(ctx: QuizCtx, choice: boolean): Promise<QuizQuestion> {
  const id = randDexId();
  const mon = await pokeAPI.getPokemon(id);
  await preloadImages([artUrl(id)]);
  const base = {
    kind: 'silhouette' as const,
    prompt: ctx.t('quiz.play.silhouettePrompt'),
    media: { imageUrl: artUrl(id), silhouette: true },
    reveal: { title: mon.displayName, subtitle: dexLabel(id), imageUrl: artUrl(id) },
  };
  return choice
    ? { ...base, answerType: 'choice', ...(await nameOptions(id, mon.displayName)) }
    : { ...base, answerType: 'text', options: [], correctIndex: -1, accept: acceptNames(mon) };
}

/** ⚔ 종족값 대결 — 둘 중 총합 높은 쪽(항상 4지선다형 2택). */
async function genBstDuel(ctx: QuizCtx, _choice: boolean): Promise<QuizQuestion> {
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

  await preloadImages([artUrl(a), artUrl(b)]);
  return {
    kind: 'bstDuel',
    prompt: ctx.t('quiz.play.bstDuelPrompt'),
    answerType: 'choice',
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

/** 🧩 타입 — 포켓몬 보고 실제 타입 고르기(오답=미보유 타입). 항상 4지선다. */
async function genType(ctx: QuizCtx, _choice: boolean): Promise<QuizQuestion> {
  const id = randDexId();
  const mon = await pokeAPI.getPokemon(id);
  const monTypes = mon.types.length ? mon.types : ['normal'];
  const correctType = monTypes[0];
  const wrong = shuffle(TYPE_SLUGS.filter(ty => !monTypes.includes(ty))).slice(0, 3);
  const opts = shuffle([correctType, ...wrong]);

  await preloadImages([artUrl(id)]);
  return {
    kind: 'type',
    prompt: ctx.t('quiz.play.typePrompt', { name: mon.displayName }),
    media: { imageUrl: artUrl(id) },
    answerType: 'choice',
    options: opts.map(ty => ({ label: ctx.t(`types.${ty}`) } as QuizOption)),
    correctIndex: opts.indexOf(correctType),
    reveal: {
      title: mon.displayName,
      subtitle: monTypes.map(ty => ctx.t(`types.${ty}`)).join(' / '),
      imageUrl: artUrl(id),
    },
  };
}

/** 🔢 도감번호 — 포켓몬 보고 전국도감 번호 고르기. 항상 4지선다. */
async function genDexNumber(ctx: QuizCtx, _choice: boolean): Promise<QuizQuestion> {
  const id = randDexId();
  const mon = await pokeAPI.getPokemon(id);
  const distractors = pickDistinctIds(3, new Set([id]));
  const nums = shuffle([id, ...distractors]);

  await preloadImages([artUrl(id)]);
  return {
    kind: 'dexNumber',
    prompt: ctx.t('quiz.play.dexPrompt', { name: mon.displayName }),
    media: { imageUrl: artUrl(id) },
    answerType: 'choice',
    options: nums.map(n => ({ label: dexLabel(n) } as QuizOption)),
    correctIndex: nums.indexOf(id),
    reveal: { title: mon.displayName, subtitle: dexLabel(id), imageUrl: artUrl(id) },
  };
}

/** 이름 4지선다(정답 + 오답 3) 구성. 실루엣/울음소리/확대/도감설명 공용. */
async function nameOptions(correctId: number, correctName: string): Promise<{ options: QuizOption[]; correctIndex: number }> {
  const distractorIds = pickDistinctIds(3, new Set([correctId]));
  const distractors = await Promise.all(distractorIds.map(d => pokeAPI.getPokemon(d)));
  const tagged = [
    { label: correctName, correct: true },
    ...distractors.map(d => ({ label: d.displayName, correct: false })),
  ];
  const opts = shuffle(tagged);
  return { options: opts.map(o => ({ label: o.label } as QuizOption)), correctIndex: opts.findIndex(o => o.correct) };
}

/** 🔊 울음소리 — cry 듣고 이름. choice=false면 주관식. */
async function genCry(ctx: QuizCtx, choice: boolean): Promise<QuizQuestion> {
  const id = randDexId();
  const mon = await pokeAPI.getPokemon(id);
  await preloadImages([artUrl(id)]);
  const base = {
    kind: 'cry' as const,
    prompt: ctx.t('quiz.play.cryPrompt'),
    media: { audioUrl: cryUrl(id) },
    reveal: { title: mon.displayName, subtitle: dexLabel(id), imageUrl: artUrl(id) },
  };
  return choice
    ? { ...base, answerType: 'choice', ...(await nameOptions(id, mon.displayName)) }
    : { ...base, answerType: 'text', options: [], correctIndex: -1, accept: acceptNames(mon) };
}

/** 🔍 확대 — 크게 확대한 아트 일부 보고 이름. choice=false면 주관식. */
async function genZoom(ctx: QuizCtx, choice: boolean): Promise<QuizQuestion> {
  const id = randDexId();
  const mon = await pokeAPI.getPokemon(id);
  const zoom = { x: 30 + Math.floor(Math.random() * 41), y: 30 + Math.floor(Math.random() * 41) };
  await preloadImages([artUrl(id)]);
  const base = {
    kind: 'zoom' as const,
    prompt: ctx.t('quiz.play.zoomPrompt'),
    media: { imageUrl: artUrl(id), zoom },
    reveal: { title: mon.displayName, subtitle: dexLabel(id), imageUrl: artUrl(id) },
  };
  return choice
    ? { ...base, answerType: 'choice', ...(await nameOptions(id, mon.displayName)) }
    : { ...base, answerType: 'text', options: [], correctIndex: -1, accept: acceptNames(mon) };
}

/** 📖 도감설명 — 도감 텍스트(이름 가림) 보고 이름. choice=false면 주관식. */
async function genFlavor(ctx: QuizCtx, choice: boolean): Promise<QuizQuestion> {
  let id = randDexId();
  let mon = await pokeAPI.getPokemon(id);
  for (let tries = 0; tries < 4 && !mon.flavorText; tries++) {
    id = randDexId();
    mon = await pokeAPI.getPokemon(id);
  }
  // 이름 노출 마스킹(정답 유출 방지) — 정규식 특수문자 escape.
  const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const masked = (mon.flavorText || ctx.t('quiz.play.flavorFallback'))
    .replace(new RegExp(esc(mon.displayName), 'gi'), '○○○')
    .replace(new RegExp(esc(mon.name), 'gi'), '○○○');
  await preloadImages([artUrl(id)]);
  const base = {
    kind: 'flavor' as const,
    prompt: `“${masked}”`,
    reveal: { title: mon.displayName, subtitle: dexLabel(id), imageUrl: artUrl(id) },
  };
  return choice
    ? { ...base, answerType: 'choice', ...(await nameOptions(id, mon.displayName)) }
    : { ...base, answerType: 'text', options: [], correctIndex: -1, accept: acceptNames(mon) };
}

const GENERATORS: Record<QuizKind, (ctx: QuizCtx, choice: boolean) => Promise<QuizQuestion>> = {
  silhouette: genSilhouette,
  cry: genCry,
  zoom: genZoom,
  type: genType,
  bstDuel: genBstDuel,
  dexNumber: genDexNumber,
  flavor: genFlavor,
};

/** 개별 종목 한 문제 — 이름 맞히기류는 주관식. 네트워크 실패 시 throw. */
export function generateQuestion(kind: QuizKind, ctx: QuizCtx): Promise<QuizQuestion> {
  return GENERATORS[kind](ctx, false);
}

/** 모의고사용 PokeAPI 생성 문제 — 항상 4지선다. */
function generateExamGenerated(ctx: QuizCtx): Promise<QuizQuestion> {
  const kind = QUIZ_KINDS[Math.floor(Math.random() * QUIZ_KINDS.length)];
  return GENERATORS[kind](ctx, true);
}

/**
 * 수능 모의고사 세션 — 큐레이션 문제은행(고인물 난이도) + PokeAPI 생성 문제 혼합.
 * 은행 문항은 세션 내 중복 없이 소진(셔플 큐), 나머지는 생성으로 채움. 전부 4지선다.
 */
export function createExamSession() {
  const bankOrder = shuffle(EXAM_BANK.map((_, i) => i));
  let bankPtr = 0;
  return {
    next(ctx: QuizCtx): Promise<QuizQuestion> {
      const bankLeft = bankPtr < bankOrder.length;
      // 은행 우선(약 60%), 소진 시 생성으로 대체
      if (bankLeft && Math.random() < 0.6) {
        return Promise.resolve(bankToQuestion(bankOrder[bankPtr++]));
      }
      return generateExamGenerated(ctx);
    },
  };
}
