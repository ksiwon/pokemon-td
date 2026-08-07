// src/services/QuizEngine.ts
// 퀴즈 문제 생성기. PokeAPI(getPokemon)로 현지화 이름·타입·스탯을 얻고,
// 공식아트 URL은 도감번호로 결정적 생성(추가 요청 0). 오답 보기 생성·셔플 포함.

import { pokeAPI, PokemonData } from '../api/pokeapi';
import {
  QuizKind, QuizQuestion, QuizOption,
  SpeedQuizKind, SPEED_QUIZ_KINDS, SpeedRound,
} from '../types/quiz';
import { EXAM_BANK, bankToQuestion } from './quizExamBank';
import POKEDEX_TYPE_INDEX from '../data/pokedexTypeIndex.json';
import POKEDEX_SPECIAL_INDEX from '../data/pokedexSpecialIndex.json';
import SIGNATURE_MOVES from '../data/signatureMoves.json';

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

/** 정답 포켓몬 id 선택 — used에 없는 것으로(라운드 내 중복 출제 방지) 뽑고 used에 등록. */
function pickMainId(used?: Set<number>): number {
  if (!used) return randDexId();
  let id = randDexId();
  // used가 전체를 덮을 일은 없음(라운드 최대 50 << 1025). 안전 상한만.
  for (let tries = 0; used.has(id) && tries < 50; tries++) id = randDexId();
  used.add(id);
  return id;
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

/** target ±spread(도감 범위 내) 중 target 제외한 서로 다른 id n개. 도감번호 오답을 근접값으로. */
function pickNearbyIds(n: number, target: number, spread: number): number[] {
  const lo = Math.max(1, target - spread);
  const hi = Math.min(MAX_DEX, target + spread);
  const pool: number[] = [];
  for (let i = lo; i <= hi; i++) if (i !== target) pool.push(i);
  return shuffle(pool).slice(0, n);
}

function shuffle<T>(arr: T[]): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

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

/** 제너레이터 컨텍스트 — 지문/타입 라벨 현지화용 t와 현재 언어. */
export interface QuizCtx {
  t: (key: string, params?: Record<string, string | number>) => string;
  /** 현재 표시 언어. 번들 인덱스(pokedexTypeIndex 등)에서 한/영 이름을 고를 때 사용. */
  lang: string;
}

/** 주관식 채점 정규화 — 소문자화 + 공백/구분기호 제거(띄어쓰기·기호 무관). */
export function normalizeAnswer(s: string): string {
  return (s || '').normalize('NFC').toLowerCase().replace(/[\s·・.\-'’ㆍ_/]/g, '').trim();
}

/** 이름 맞히기 인정 정답 후보(현지화명 + 영문 slug). */
function acceptNames(mon: { displayName: string; name: string }): string[] {
  return Array.from(new Set([mon.displayName, mon.name].filter(Boolean)));
}

// ─── 초성 퀴즈 유틸 ────────────────────────────────────────────────────────────
/** 한글 초성 19자(유니코드 초성 인덱스 순). */
const CHOSUNG = ['ㄱ','ㄲ','ㄴ','ㄷ','ㄸ','ㄹ','ㅁ','ㅂ','ㅃ','ㅅ','ㅆ','ㅇ','ㅈ','ㅉ','ㅊ','ㅋ','ㅌ','ㅍ','ㅎ'];

/** 문자열 → 초성열. 한글 음절은 초성으로, 그 외(숫자·영문·기호)는 그대로 둔다. */
function toChosung(s: string): string {
  let out = '';
  for (const ch of s) {
    const code = ch.charCodeAt(0);
    if (code >= 0xac00 && code <= 0xd7a3) out += CHOSUNG[Math.floor((code - 0xac00) / 588)];
    else out += ch;
  }
  return out;
}

/** 문자열 내 한글 음절 개수. */
function hangulCount(s: string): number {
  let n = 0;
  for (const ch of s) {
    const c = ch.charCodeAt(0);
    if (c >= 0xac00 && c <= 0xd7a3) n++;
  }
  return n;
}

/** 초성 퀴즈 후보 자격 — 한글 2음절 이상(1음절은 초성만으론 너무 모호). */
function isChosungCandidate(name: string): boolean {
  return !!name && hangulCount(name) >= 2;
}

type ChosungCat = 'pokemon' | 'move' | 'ability' | 'item';

/** 카테고리 출제 가중치(포켓몬·기술 위주, 도구는 큐레이션 풀). */
const CHOSUNG_CATS: Array<{ cat: ChosungCat; weight: number }> = [
  { cat: 'pokemon', weight: 35 },
  { cat: 'move', weight: 30 },
  { cat: 'ability', weight: 15 },
  { cat: 'item', weight: 20 },
];

function pickChosungCat(): ChosungCat {
  const total = CHOSUNG_CATS.reduce((s, c) => s + c.weight, 0);
  let r = Math.random() * total;
  for (const c of CHOSUNG_CATS) { r -= c.weight; if (r <= 0) return c.cat; }
  return 'pokemon';
}

/** 도구 큐레이션 풀 — 한글 이름이 확실하고 유명한 아이템 슬러그(PokeAPI /item/{slug}). */
const CHOSUNG_ITEM_SLUGS = [
  'poke-ball','great-ball','ultra-ball','master-ball','premier-ball','quick-ball','dusk-ball','timer-ball',
  'potion','super-potion','hyper-potion','max-potion','full-restore','revive','max-revive','ether','elixir',
  'antidote','burn-heal','ice-heal','awakening','paralyze-heal','full-heal',
  'rare-candy','pp-up','protein','iron','calcium','zinc','carbos','hp-up',
  'leftovers','choice-band','choice-scarf','choice-specs','life-orb','focus-sash','assault-vest','rocky-helmet',
  'eviolite','black-sludge','quick-claw','light-clay','mental-herb','wide-lens','scope-lens','muscle-band','wise-glasses',
  'fire-stone','water-stone','thunder-stone','leaf-stone','moon-stone','sun-stone','dusk-stone','dawn-stone','shiny-stone','ice-stone','everstone',
  'exp-share','amulet-coin','lucky-egg','soothe-bell','metal-coat','dragon-scale','kings-rock','razor-claw','razor-fang','reaper-cloth','oval-stone',
  'sitrus-berry','oran-berry','lum-berry','leppa-berry','cheri-berry','chesto-berry','pecha-berry',
];

/** 카테고리별 랜덤 항목의 현지화 이름 조회. 초성 자격 미달·404 시 재시도, 실패하면 포켓몬으로 폴백. */
async function fetchChosungEntry(cat: ChosungCat, used?: Set<number>): Promise<{ name: string; en: string; imageUrl?: string }> {
  for (let tries = 0; tries < 8; tries++) {
    try {
      if (cat === 'pokemon') {
        const id = pickMainId(used);
        const m = await pokeAPI.getPokemon(id);
        if (isChosungCandidate(m.displayName)) return { name: m.displayName, en: m.name, imageUrl: artUrl(id) };
      } else if (cat === 'move') {
        const id = 1 + Math.floor(Math.random() * 900);
        const mv = await pokeAPI.getMove(String(id));
        if (isChosungCandidate(mv.displayName)) return { name: mv.displayName, en: mv.name };
      } else if (cat === 'ability') {
        const id = 1 + Math.floor(Math.random() * 300);
        const ab = await pokeAPI.getAbilityName(id);
        if (isChosungCandidate(ab.displayName)) return { name: ab.displayName, en: ab.name };
      } else {
        const slug = CHOSUNG_ITEM_SLUGS[Math.floor(Math.random() * CHOSUNG_ITEM_SLUGS.length)];
        const it = await pokeAPI.getItemName(slug);
        if (isChosungCandidate(it.displayName)) return { name: it.displayName, en: it.name };
      }
    } catch {
      // 빈 id(404)·네트워크 오류 → 다음 시도
    }
  }
  // 폴백: 포켓몬 이름은 전부 한글 2음절+ 이므로 항상 성공.
  const id = pickMainId(used);
  const m = await pokeAPI.getPokemon(id);
  return { name: m.displayName, en: m.name, imageUrl: artUrl(id) };
}

/** 🔡 초성 — 초성열 보고 이름 맞히기(주관식). easy=유형 힌트 표시, hard=유형 숨김. */
async function genChosung(ctx: QuizCtx, easy: boolean, used?: Set<number>): Promise<QuizQuestion> {
  const cat = pickChosungCat();
  const entry = await fetchChosungEntry(cat, used);
  const catLabel = ctx.t(`quiz.chosung.cat.${cat}`);
  await preloadImages(entry.imageUrl ? [entry.imageUrl] : []);
  const accept = Array.from(new Set([entry.name, entry.en].filter(Boolean)));
  return {
    kind: easy ? 'chosungEasy' : 'chosungHard',
    prompt: easy ? ctx.t('quiz.play.chosungEasyPrompt', { cat: catLabel }) : ctx.t('quiz.play.chosungHardPrompt'),
    bigText: toChosung(entry.name),
    answerType: 'text',
    options: [],
    correctIndex: -1,
    accept,
    inputPlaceholder: easy
      ? ctx.t('quiz.play.chosungEasyPlaceholder', { cat: catLabel })
      : ctx.t('quiz.play.chosungHardPlaceholder'),
    reveal: {
      title: entry.name,
      subtitle: entry.en && entry.en !== entry.name ? `${catLabel} · ${entry.en}` : catLabel,
      imageUrl: entry.imageUrl,
    },
  };
}

// ─── 종목별 생성기 ─────────────────────────────────────────────────────────────

/** 🕶 누구게 — 실루엣 보고 이름. choice=false면 주관식. */
async function genSilhouette(ctx: QuizCtx, choice: boolean, used?: Set<number>): Promise<QuizQuestion> {
  const id = pickMainId(used);
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

/** ⚔ 종족값 대결 — HigherLower 방식. 스탯 1개 지정, 왼쪽 값 공개 → 오른쪽이 더 많을지/적을지. */
const DUEL_STAT_KEYS = ['hp', 'attack', 'defense', 'specialAttack', 'specialDefense', 'speed'] as const;

async function genBstDuel(ctx: QuizCtx, _choice: boolean, used?: Set<number>): Promise<QuizQuestion> {
  const statKey = DUEL_STAT_KEYS[Math.floor(Math.random() * DUEL_STAT_KEYS.length)];
  let a = pickMainId(used);
  let b = pickMainId(used);
  while (b === a) b = pickMainId(used);

  let [monA, monB] = await Promise.all([pokeAPI.getPokemon(a), pokeAPI.getPokemon(b)]);
  let va = monA.stats[statKey];
  let vb = monB.stats[statKey];

  // 동점이면 오른쪽을 재추첨 — '더 많이/더 적게'가 모호해지지 않도록.
  for (let tries = 0; va === vb && tries < 6; tries++) {
    let nb = pickMainId(used);
    while (nb === a) nb = pickMainId(used);
    b = nb;
    monB = await pokeAPI.getPokemon(b);
    vb = monB.stats[statKey];
  }

  const rightHigher = vb > va; // 오른쪽(B)이 왼쪽(A)보다 높은가
  const statLabel = ctx.t(`quiz.bst.stat.${statKey}`);

  await preloadImages([artUrl(a), artUrl(b)]);
  return {
    kind: 'bstDuel',
    prompt: ctx.t('quiz.play.bstDuelStatPrompt', { stat: statLabel }),
    answerType: 'choice',
    // 보기: [더 많이(0), 더 적게(1)] — DuelView가 방향 버튼으로 렌더.
    options: [{ label: ctx.t('quiz.play.duelMore') }, { label: ctx.t('quiz.play.duelLess') }],
    correctIndex: rightHigher ? 0 : 1,
    duel: {
      statLabel,
      left: { name: monA.displayName, imageUrl: artUrl(a), value: va },
      right: { name: monB.displayName, imageUrl: artUrl(b), value: vb },
    },
    reveal: {
      title: ctx.t('quiz.play.duelReveal', { ln: monA.displayName, lv: va, rn: monB.displayName, rv: vb }),
      subtitle: statLabel,
    },
  };
}

/** 🧩 타입 — 포켓몬의 (복합)타입 조합 고르기. 복합타입은 '한 타입만 다른' 유사 오답. 항상 4지선다. */
async function genType(ctx: QuizCtx, _choice: boolean, used?: Set<number>): Promise<QuizQuestion> {
  const id = pickMainId(used);
  const mon = await pokeAPI.getPokemon(id);
  const monTypes = (mon.types.length ? mon.types : ['normal']).slice(0, 2);
  const wrongPool = shuffle(TYPE_SLUGS.filter(ty => !monTypes.includes(ty)));

  // 정답 = 실제 타입 조합. 복합이면 오답 3개는 '한 타입만' 틀리게(비슷비슷). 단일이면 다른 단일타입.
  const optionSets: string[][] = [monTypes];
  if (monTypes.length === 2) {
    optionSets.push(
      [monTypes[0], wrongPool[0]], // 뒤 타입만 오답
      [wrongPool[1], monTypes[1]], // 앞 타입만 오답
      [monTypes[0], wrongPool[2]], // 뒤 타입만 오답(다른 값)
    );
  } else {
    optionSets.push([wrongPool[0]], [wrongPool[1]], [wrongPool[2]]);
  }
  const opts = shuffle(optionSets);
  const label = (set: string[]) => set.map(ty => ctx.t(`types.${ty}`)).join(' / ');

  await preloadImages([artUrl(id)]);
  return {
    kind: 'type',
    prompt: ctx.t('quiz.play.typePrompt', { name: mon.displayName }),
    media: { imageUrl: artUrl(id) },
    answerType: 'choice',
    options: opts.map(set => ({ label: label(set) } as QuizOption)),
    correctIndex: opts.indexOf(monTypes),
    reveal: {
      title: mon.displayName,
      subtitle: label(monTypes),
      imageUrl: artUrl(id),
    },
  };
}

// ─── 타입(어려움) 인덱스 ───────────────────────────────────────────────────────
//   번들된 1025종 인덱스(id·한/영이름·타입 슬롯순)로 '이름→타입' 동적 채점.
interface DexTypeEntry { id: number; ko: string; en: string; t: string[] }
const DEX_TYPE = POKEDEX_TYPE_INDEX as DexTypeEntry[];
/** 도감번호 → 번들 엔트리(한/영 이름·타입). 이름 기반 신규 종목이 API 없이 동작하는 근거. */
const ENTRY_BY_ID = new Map<number, DexTypeEntry>(DEX_TYPE.map(e => [e.id, e]));
/** 번들 엔트리의 현지화 이름. 해당 언어가 비어 있으면 다른 쪽으로 폴백. */
const dexName = (e: DexTypeEntry, lang: string): string =>
  (lang === 'ko' ? e.ko || e.en : e.en || e.ko);
/** 정규화된 이름(한/영) → 보유 타입 집합. */
const NAME_TO_TYPES = new Map<string, Set<string>>();
/** '정확한 타이핑'별 풀 — 단일=순수 그 타입만, 복합=정확히 그 2타입만. 타입 순서 표시는 첫 등장 슬롯순. */
const MONO_TYPINGS: Array<{ types: string[]; pool: DexTypeEntry[] }> = [];
const DUAL_TYPINGS: Array<{ types: string[]; pool: DexTypeEntry[] }> = [];
{
  const byKey = new Map<string, { types: string[]; pool: DexTypeEntry[] }>();
  for (const e of DEX_TYPE) {
    const set = new Set(e.t);
    if (e.ko) NAME_TO_TYPES.set(normalizeAnswer(e.ko), set);
    if (e.en) NAME_TO_TYPES.set(normalizeAnswer(e.en), set);
    const key = e.t.length === 1 ? e.t[0] : [...e.t].sort().join('|');
    let c = byKey.get(key);
    if (!c) { c = { types: e.t.slice(), pool: [] }; byKey.set(key, c); }
    c.pool.push(e);
  }
  // 단일 18종 + 실제 존재하는 모든 복합 조합(정답 1마리뿐인 희귀 조합도 포함) 전부 출제.
  for (const c of byKey.values()) (c.types.length === 1 ? MONO_TYPINGS : DUAL_TYPINGS).push(c);
}

/** 🧬 타입(어려움) — 제시된 타이핑과 '정확히 일치'하는 포켓몬 '이름 입력'(주관식·동적채점).
 *  단일=순수 그 타입만(고스트→데스니칸 O; 고오스=고스트/독 X), 복합=정확히 그 2타입(램프라=고스트/불꽃).
 *  단일 18종 + 모든 복합 조합(정답 1마리 조합 포함) 전부 출제, 타이핑 단위 균등 추첨. */
async function genTypeHard(ctx: QuizCtx, _choice: boolean, _used?: Set<number>): Promise<QuizQuestion> {
  // 50% 복합 / 50% 단일(둘 다 타이핑 단위 균등). 한쪽이 비면 다른쪽으로 폴백.
  const useDual = Math.random() < 0.5 && DUAL_TYPINGS.length > 0;
  const list = (useDual || MONO_TYPINGS.length === 0) ? DUAL_TYPINGS : MONO_TYPINGS;
  const typing = list[Math.floor(Math.random() * list.length)];
  const target = typing.types;
  const label = target.map(ty => ctx.t(`types.${ty}`)).join(' / ');
  const example = typing.pool[Math.floor(Math.random() * typing.pool.length)];
  const exampleLabel = `${dexName(example, ctx.lang)} (${example.t.map(ty => ctx.t(`types.${ty}`)).join(' / ')})`;

  await preloadImages([artUrl(example.id)]);
  return {
    kind: 'typeHard',
    prompt: ctx.t('quiz.play.typeHardPrompt', { types: label }),
    answerType: 'text',
    options: [],
    correctIndex: -1,
    // 입력 포켓몬의 타입 집합이 target과 '정확히' 같아야 정답(부분 포함은 오답).
    validateText: (norm: string) => {
      const ts = NAME_TO_TYPES.get(norm);
      return !!ts && ts.size === target.length && target.every(ty => ts.has(ty));
    },
    inputPlaceholder: ctx.t('quiz.play.typeHardPlaceholder'),
    reveal: {
      title: label,
      subtitle: ctx.t('quiz.play.typeHardRevealSub', { name: exampleLabel }),
      imageUrl: artUrl(example.id),
    },
  };
}

/** 🔢 도감번호 — 포켓몬 보고 전국도감 번호 고르기. 항상 4지선다. */
async function genDexNumber(ctx: QuizCtx, _choice: boolean, used?: Set<number>): Promise<QuizQuestion> {
  const id = pickMainId(used);
  const mon = await pokeAPI.getPokemon(id);
  // 오답 보기를 정답 ±10 범위의 근접 번호로 → 보기들이 비슷비슷해 난이도↑
  const distractors = pickNearbyIds(3, id, 10);
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
async function genCry(ctx: QuizCtx, choice: boolean, used?: Set<number>): Promise<QuizQuestion> {
  const id = pickMainId(used);
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
async function genZoom(ctx: QuizCtx, choice: boolean, used?: Set<number>): Promise<QuizQuestion> {
  const id = pickMainId(used);
  const mon = await pokeAPI.getPokemon(id);
  // scale(10) 고배율이라 원점을 몸통 중심부(38~62%)로 좁혀 빈 배경만 잡히는 걸 방지.
  const zoom = { x: 38 + Math.floor(Math.random() * 25), y: 38 + Math.floor(Math.random() * 25) };
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
async function genFlavor(ctx: QuizCtx, choice: boolean, used?: Set<number>): Promise<QuizQuestion> {
  let id = pickMainId(used);
  let mon = await pokeAPI.getPokemon(id);
  // 한글 도감설명이 있는 개체만 출제 — 9세대 등 미현지화(en 폴백) 개체는 재추첨으로 회피.
  for (let tries = 0; tries < 8 && (!mon.flavorText || !mon.flavorLocalized); tries++) {
    id = pickMainId(used);
    mon = await pokeAPI.getPokemon(id);
  }
  const masked = maskName(mon.flavorText || ctx.t('quiz.play.flavorFallback'), mon);
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

// ─── 신규 종목(랜덤힌트·타입 오드원아웃·특별분류·헷갈리는 이름·전용기술) ────────
//   앞의 네 개는 번들 인덱스만으로 문제를 만들 수 있어 PokeAPI 요청이 0~1회다.

const pickOne = <T,>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];

/** 전국도감 번호 → 세대(1~9). */
function generationOf(id: number): number {
  const bounds = [151, 251, 386, 493, 649, 721, 809, 905, MAX_DEX];
  return bounds.findIndex(b => id <= b) + 1;
}

/** 도감설명에서 이름을 ○○○으로 가린다(정답 유출 방지). 정규식 특수문자 escape 포함. */
function maskName(text: string, mon: { displayName: string; name: string }): string {
  const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return text
    .replace(new RegExp(esc(mon.displayName), 'gi'), '○○○')
    .replace(new RegExp(esc(mon.name), 'gi'), '○○○');
}

/** 랜덤 힌트 후보 문장 풀. 이름을 유추할 수 있되 직접 노출하지 않는 정보만. */
function buildHintPool(ctx: QuizCtx, mon: PokemonData, id: number): string[] {
  const bst = DUEL_STAT_KEYS.reduce((s, k) => s + mon.stats[k], 0);
  const topStat = DUEL_STAT_KEYS.reduce((a, b) => (mon.stats[b] > mon.stats[a] ? b : a));
  const pool: string[] = [
    ctx.t('quiz.hint.type', { types: (mon.types.length ? mon.types : ['normal']).map(ty => ctx.t(`types.${ty}`)).join(' / ') }),
    ctx.t('quiz.hint.gen', { n: generationOf(id) }),
    ctx.t('quiz.hint.bst', { n: bst }),
    ctx.t('quiz.hint.topStat', { stat: ctx.t(`quiz.bst.stat.${topStat}`), n: mon.stats[topStat] }),
    ctx.t('quiz.hint.size', { h: mon.heightM.toFixed(1), w: mon.weightKg.toFixed(1) }),
  ];
  if (mon.genus) pool.push(ctx.t('quiz.hint.genus', { genus: mon.genus }));
  if (mon.abilities.length) pool.push(ctx.t('quiz.hint.ability', { name: pickOne(mon.abilities).displayName }));
  // 도감설명은 현재 언어로 있을 때만(9세대는 한글 미제공) + 이름 마스킹 필수.
  if (mon.flavorText && mon.flavorLocalized) {
    pool.push(ctx.t('quiz.hint.flavor', { text: maskName(mon.flavorText, mon) }));
  }
  return pool;
}

/** 🧠 랜덤 힌트 — 도감 정보 3가지만 보고 이름 맞히기(주관식). */
async function genHint(ctx: QuizCtx, choice: boolean, used?: Set<number>): Promise<QuizQuestion> {
  const id = pickMainId(used);
  const mon = await pokeAPI.getPokemon(id);
  const pool = buildHintPool(ctx, mon, id);

  await preloadImages([artUrl(id)]);
  const base = {
    kind: 'hint' as const,
    prompt: ctx.t('quiz.play.hintPrompt'),
    hintLines: shuffle(pool).slice(0, 3),
    reveal: { title: mon.displayName, subtitle: dexLabel(id), imageUrl: artUrl(id) },
  };
  return choice
    ? { ...base, answerType: 'choice', ...(await nameOptions(id, mon.displayName)) }
    : { ...base, answerType: 'text', options: [], correctIndex: -1, accept: acceptNames(mon) };
}

/** 🔀 타입 오드원아웃 — 4마리 중 타입 조합이 혼자 다른 하나. 번들 인덱스만 사용(오프라인).
 *  타입 순서는 구별하지 않는다(물/땅 = 땅/물) — 조합 자체가 다른 한 마리만 정답. */
async function genTypeOdd(ctx: QuizCtx, _choice: boolean, used?: Set<number>): Promise<QuizQuestion> {
  const groups = [...MONO_TYPINGS, ...DUAL_TYPINGS].filter(g => g.pool.length >= 3);
  const base = pickOne(groups);
  // 오답(정답이 되는 '혼자 다른 놈')은 가능하면 한 타입을 공유하는 근접 조합으로 → 눈대중으로 못 고르게.
  const near = groups.filter(g => g !== base && g.types.some(ty => base.types.includes(ty)));
  const oddGroup = near.length ? pickOne(near) : pickOne(groups.filter(g => g !== base));

  const three = shuffle(base.pool).slice(0, 3);
  const odd = pickOne(oddGroup.pool.filter(e => !three.includes(e))) ?? oddGroup.pool[0];
  used?.add(odd.id);

  const entries = shuffle([...three.map(e => ({ e, odd: false })), { e: odd, odd: true }]);
  const typeLabel = (types: string[]) => types.map(ty => ctx.t(`types.${ty}`)).join(' / ');

  await preloadImages(entries.map(x => artUrl(x.e.id)));
  return {
    kind: 'typeOdd',
    prompt: ctx.t('quiz.play.typeOddPrompt'),
    answerType: 'choice',
    options: entries.map(x => ({ label: dexName(x.e, ctx.lang), imageUrl: artUrl(x.e.id) } as QuizOption)),
    correctIndex: entries.findIndex(x => x.odd),
    reveal: {
      title: dexName(odd, ctx.lang),
      subtitle: ctx.t('quiz.play.typeOddRevealSub', { odd: typeLabel(odd.t), common: typeLabel(base.types) }),
      imageUrl: artUrl(odd.id),
    },
  };
}

// ─── 특별 분류(전설/환상/패러독스/울트라비스트) ────────────────────────────────
type SpecialCat = 'legendary' | 'mythical' | 'paradox' | 'ultraBeast' | 'normal';
const SPECIAL_INDEX = POKEDEX_SPECIAL_INDEX as Record<Exclude<SpecialCat, 'normal'>, number[]>;
const SPECIAL_CATS: SpecialCat[] = ['legendary', 'mythical', 'paradox', 'ultraBeast', 'normal'];
/** 특별 분류에 속한 전체 id(= '일반' 추첨에서 제외할 집합). */
const SPECIAL_ALL = new Set<number>(
  (Object.keys(SPECIAL_INDEX) as Array<Exclude<SpecialCat, 'normal'>>).flatMap(k => SPECIAL_INDEX[k])
);

/** ✨ 특별 분류 — 이 포켓몬이 전설/환상/패러독스/울트라비스트/일반 중 무엇인지. 항상 4지선다.
 *  분류 근거는 PokeAPI species 플래그(전설·환상) + 고정 목록(패러독스·UB). scripts/genQuizData.mjs 참조. */
async function genSpecial(ctx: QuizCtx, _choice: boolean, used?: Set<number>): Promise<QuizQuestion> {
  // 특별 분류가 전체의 ~12%뿐이라 균등 추첨하면 '일반'만 나온다 → 특별 65% : 일반 35%로 편향.
  const specialCats = SPECIAL_CATS.filter(c => c !== 'normal');
  let cat: SpecialCat;
  let id: number;
  if (Math.random() < 0.65) {
    cat = pickOne(specialCats);
    const pool = SPECIAL_INDEX[cat as Exclude<SpecialCat, 'normal'>];
    id = pickOne(pool);
    for (let tries = 0; used?.has(id) && tries < 20; tries++) id = pickOne(pool);
    used?.add(id);
  } else {
    cat = 'normal';
    id = pickMainId(used);
    for (let tries = 0; SPECIAL_ALL.has(id) && tries < 20; tries++) id = pickMainId(used);
  }

  const mon = await pokeAPI.getPokemon(id);
  const catLabel = (c: SpecialCat) => ctx.t(`quiz.special.cat.${c}`);
  const opts = shuffle([cat, ...shuffle(SPECIAL_CATS.filter(c => c !== cat)).slice(0, 3)]);

  await preloadImages([artUrl(id)]);
  return {
    kind: 'special',
    prompt: ctx.t('quiz.play.specialPrompt', { name: mon.displayName }),
    media: { imageUrl: artUrl(id) },
    answerType: 'choice',
    options: opts.map(c => ({ label: catLabel(c) } as QuizOption)),
    correctIndex: opts.indexOf(cat),
    reveal: { title: mon.displayName, subtitle: catLabel(cat), imageUrl: artUrl(id) },
  };
}

// ─── 헷갈리는 이름 ─────────────────────────────────────────────────────────────
/** 편집 거리(Levenshtein). 이름 길이가 짧아(≤15자) 전 도감 비교도 즉시 끝난다. */
function editDistance(a: string, b: string): number {
  const m = a.length, n = b.length;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  const cur = new Array<number>(n + 1);
  for (let i = 1; i <= m; i++) {
    cur[0] = i;
    for (let j = 1; j <= n; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur.slice();
  }
  return prev[n];
}

/** 이름 유사도(0~1+). 편집거리 기반에 앞/뒤 글자 일치 보너스 — '리자몽/리자드', '마자용/마자몽'류를 위로. */
function nameSimilarity(a: string, b: string): number {
  const max = Math.max(a.length, b.length) || 1;
  let pre = 0;
  while (pre < a.length && pre < b.length && a[pre] === b[pre]) pre++;
  let suf = 0;
  while (suf < a.length - pre && suf < b.length - pre && a[a.length - 1 - suf] === b[b.length - 1 - suf]) suf++;
  return (1 - editDistance(a, b) / max) + pre * 0.15 + suf * 0.1;
}

/** 🅰 헷갈리는 이름 — 아트를 보고 유사한 이름 4개 중 진짜 이름 고르기. 번들 인덱스만 사용(오프라인). */
async function genSimilarName(ctx: QuizCtx, _choice: boolean, used?: Set<number>): Promise<QuizQuestion> {
  const id = pickMainId(used);
  const entry = ENTRY_BY_ID.get(id) ?? DEX_TYPE[0];
  const name = dexName(entry, ctx.lang);
  const norm = normalizeAnswer(name);

  // 유사도 상위 10명 중 3명을 무작위로 — 같은 포켓몬이 나와도 보기가 매번 달라지게.
  const ranked = DEX_TYPE
    .filter(e => e.id !== entry.id)
    .map(e => ({ e, s: nameSimilarity(norm, normalizeAnswer(dexName(e, ctx.lang))) }))
    .sort((x, y) => y.s - x.s)
    .slice(0, 10);
  const distractors = shuffle(ranked).slice(0, 3).map(r => r.e);

  const opts = shuffle([
    { label: name, correct: true },
    ...distractors.map(d => ({ label: dexName(d, ctx.lang), correct: false })),
  ]);

  await preloadImages([artUrl(entry.id)]);
  return {
    kind: 'similarName',
    prompt: ctx.t('quiz.play.similarNamePrompt'),
    media: { imageUrl: artUrl(entry.id) },
    answerType: 'choice',
    options: opts.map(o => ({ label: o.label } as QuizOption)),
    correctIndex: opts.findIndex(o => o.correct),
    reveal: { title: name, subtitle: dexLabel(entry.id), imageUrl: artUrl(entry.id) },
  };
}

// ─── 전용기술 ──────────────────────────────────────────────────────────────────
interface SignatureMove { m: number; ko: string; en: string; p: number }
const SIGNATURE = (SIGNATURE_MOVES as SignatureMove[]).filter(s => ENTRY_BY_ID.has(s.p));

/** 💥 전용기술 — 그 기술을 배우는 유일한 포켓몬 고르기. 항상 4지선다(아트 보기).
 *  오답은 정답과 타입을 공유하는 포켓몬으로 → 타입만 보고 찍기 어렵게. */
async function genSignature(ctx: QuizCtx, _choice: boolean, used?: Set<number>): Promise<QuizQuestion> {
  let sig = pickOne(SIGNATURE);
  for (let tries = 0; used?.has(sig.p) && tries < 20; tries++) sig = pickOne(SIGNATURE);
  used?.add(sig.p);

  const owner = ENTRY_BY_ID.get(sig.p)!;
  const moveName = ctx.lang === 'ko' ? (sig.ko || sig.en) : (sig.en || sig.ko);

  const sameType = DEX_TYPE.filter(e => e.id !== owner.id && e.t.some(ty => owner.t.includes(ty)));
  const pool = sameType.length >= 3 ? sameType : DEX_TYPE.filter(e => e.id !== owner.id);
  const distractors = shuffle(pool).slice(0, 3);

  const entries = shuffle([{ e: owner, correct: true }, ...distractors.map(e => ({ e, correct: false }))]);
  await preloadImages(entries.map(x => artUrl(x.e.id)));
  return {
    kind: 'signature',
    prompt: ctx.t('quiz.play.signaturePrompt', { move: moveName }),
    answerType: 'choice',
    options: entries.map(x => ({ label: dexName(x.e, ctx.lang), imageUrl: artUrl(x.e.id) } as QuizOption)),
    correctIndex: entries.findIndex(x => x.correct),
    reveal: {
      title: dexName(owner, ctx.lang),
      subtitle: ctx.t('quiz.play.signatureRevealSub', { move: moveName }),
      imageUrl: artUrl(owner.id),
    },
  };
}

const GENERATORS: Record<QuizKind, (ctx: QuizCtx, choice: boolean, used?: Set<number>) => Promise<QuizQuestion>> = {
  silhouette: genSilhouette,
  cry: genCry,
  zoom: genZoom,
  type: genType,
  typeHard: genTypeHard,
  bstDuel: genBstDuel,
  dexNumber: genDexNumber,
  flavor: genFlavor,
  chosungEasy: (ctx, _choice, used) => genChosung(ctx, true, used),
  chosungHard: (ctx, _choice, used) => genChosung(ctx, false, used),
  hint: genHint,
  typeOdd: genTypeOdd,
  special: genSpecial,
  similarName: genSimilarName,
  signature: genSignature,
};

/** 개별 종목 세션 — 라운드 내 정답 포켓몬 중복 출제 방지(used 공유). */
export function createQuizSession(kind: QuizKind) {
  const used = new Set<number>();
  return {
    next(ctx: QuizCtx): Promise<QuizQuestion> {
      return GENERATORS[kind](ctx, false, used);
    },
  };
}

// ─── 속도 퀴즈(실시간 멀티) ────────────────────────────────────────────────────
/**
 * 인정 정답 — **한글명·영문명·영문 slug 전부**.
 * 방 안에 한국어 유저와 영어 유저가 섞일 수 있고 문제는 호스트 언어로 생성되므로,
 * 한쪽 언어 이름만 인정하면 반대쪽 유저가 구조적으로 못 맞힌다.
 * 번들 인덱스(pokedexTypeIndex)에서 가져오므로 추가 API 요청은 없다.
 */
function speedAccept(id: number, mon: PokemonData): string[] {
  const e = ENTRY_BY_ID.get(id);
  return Array.from(new Set([e?.ko, e?.en, mon.displayName, mon.name].filter(Boolean) as string[]));
}

/**
 * 속도 퀴즈 한 문제 생성(호스트 전용).
 * payload = 전원에게 방송할 것 / reveal·accept = 공개 전까지 호스트만 보관.
 * 지문(prompt)은 payload.kind만 보내고 **각 클라이언트가 자기 언어로 렌더**한다 —
 * 호스트 언어 문장을 그대로 뿌리면 언어가 다른 참가자에게 남의 말로 보인다.
 * (도감설명 본문·힌트 문장만은 원문 특성상 호스트 언어로 나간다.)
 */
async function genSpeedRound(ctx: QuizCtx, used?: Set<number>): Promise<SpeedRound> {
  const kind: SpeedQuizKind = pickOne(SPEED_QUIZ_KINDS);
  let id = pickMainId(used);
  let mon = await pokeAPI.getPokemon(id);

  // 도감설명 종목은 현재 언어 도감설명이 있는 개체만(9세대는 한글 미제공) 재추첨.
  if (kind === 'flavor') {
    for (let tries = 0; tries < 8 && (!mon.flavorText || !mon.flavorLocalized); tries++) {
      id = pickMainId(used);
      mon = await pokeAPI.getPokemon(id);
    }
  }

  const payload: SpeedRound['payload'] = { kind };
  if (kind === 'silhouette') { payload.imageUrl = artUrl(id); payload.silhouette = true; }
  else if (kind === 'cry') { payload.audioUrl = cryUrl(id); }
  else if (kind === 'zoom') {
    payload.imageUrl = artUrl(id);
    payload.zoom = { x: 38 + Math.floor(Math.random() * 25), y: 38 + Math.floor(Math.random() * 25) };
  } else if (kind === 'flavor') {
    payload.text = maskName(mon.flavorText || ctx.t('quiz.play.flavorFallback'), mon);
  } else {
    payload.hintLines = shuffle(buildHintPool(ctx, mon, id)).slice(0, 3);
  }

  await preloadImages([artUrl(id)]);
  return {
    payload,
    reveal: { title: mon.displayName, subtitle: dexLabel(id), imageUrl: artUrl(id) },
    accept: speedAccept(id, mon),
  };
}

/** 속도 퀴즈 세션(호스트가 소유). 한 게임 안에서 같은 포켓몬이 두 번 나오지 않게 used 공유. */
export function createSpeedSession() {
  const used = new Set<number>();
  return {
    next(ctx: QuizCtx): Promise<SpeedRound> {
      return genSpeedRound(ctx, used);
    },
  };
}

/**
 * 수능 모의고사 세션 — 100% 큐레이션 문제은행(고인물 난이도, 전부 4지선다).
 * 셔플 큐 순서대로 소진 → 라운드 내 중복 없음(은행 크기 > 라운드 문항 수).
 */
export function createExamSession() {
  let bankOrder = shuffle(EXAM_BANK.map((_, i) => i));
  let bankPtr = 0;
  return {
    next(_ctx: QuizCtx): Promise<QuizQuestion> {
      // 은행보다 문항 수가 많을 때만 재셔플로 순환(현재 은행>라운드라 실제 미발생).
      if (bankPtr >= bankOrder.length) { bankOrder = shuffle(bankOrder); bankPtr = 0; }
      return Promise.resolve(bankToQuestion(bankOrder[bankPtr++]));
    },
  };
}
