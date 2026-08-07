// scripts/genQuizData.mjs
// 퀴즈 전용 번들 데이터 생성기(1회성 오프라인 스크립트). `npm run quiz:data`로 실행.
//   → src/data/pokedexSpecialIndex.json  : 전설/환상/패러독스/울트라비스트 분류
//   → src/data/signatureMoves.json       : 전용기술(한 종족만 배우는 기술) 목록
// 런타임(앱)은 PokeAPI를 두드리지 않고 이 JSON만 읽는다 — 오프라인·즉시·무료.
// src/data/pokedexTypeIndex.json 과 같은 성격의 산출물(생성은 여기, 소비는 QuizEngine).

import { writeFileSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const API = 'https://pokeapi.co/api/v2';
const MAX_DEX = 1025;
// PokeAPI가 동시 요청이 많으면 간헐적으로 연결을 끊는다(실측: 12 동시에서 ~600건째 실패).
const CONCURRENCY = 8;

/** 패러독스 포켓몬 전국도감 번호. PokeAPI에 전용 플래그가 없어 고정 목록으로 관리.
 *  코라이돈(1007)·미라이돈(1008)은 is_legendary=true 라 분류 논쟁이 생기므로 제외(아래 EXCLUDE). */
const PARADOX_IDS = [
  984, 985, 986, 987, 988, 989, 990, 991, 992, 993, 994, 995, // 고대/미래 12종
  1005, 1006,             // 무쇠기수/무쇠사자 계열(굽이치는소용돌이·무쇠무인)
  1009, 1010,             // 굽이치는물결·무쇠잎새
  1020, 1021, 1022, 1023, // 우렁찬불꽃·타부자고… 남청의원반 4종
];

/** 울트라비스트 전국도감 번호. PokeAPI는 이들을 is_legendary=true 로 표기해 구분이 불가 → 고정 목록. */
const ULTRA_BEAST_IDS = [793, 794, 795, 796, 797, 798, 799, 803, 804, 805, 806];

/** 분류가 애매해 출제에서 빼는 종. 코라이돈/미라이돈 = 전설이면서 패러독스. */
const EXCLUDE_IDS = [1007, 1008];

let failedCount = 0;

/** 지수 백오프 재시도. 끝내 실패하면 throw 대신 null — 한 건 때문에 전수 조사가 통째로 날아가지 않게. */
async function jget(url, tries = 6) {
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url);
      if (res.ok) return await res.json();
      if (res.status === 404) return null;
    } catch {
      // 네트워크 오류 → 백오프 후 재시도
    }
    await new Promise(r => setTimeout(r, 600 * 2 ** i));
  }
  failedCount++;
  console.warn(`\n  ! fetch 실패(스킵): ${url}`);
  return null;
}

/** tasks를 동시 limit개씩 실행. 진행률 로그. */
async function runPool(tasks, limit, label) {
  const out = new Array(tasks.length);
  let next = 0;
  let done = 0;
  const worker = async () => {
    while (next < tasks.length) {
      const i = next++;
      out[i] = await tasks[i]();
      if (++done % 100 === 0) process.stdout.write(`  ${label} ${done}/${tasks.length}\r`);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, tasks.length) }, worker));
  process.stdout.write(`  ${label} ${done}/${tasks.length}\n`);
  return out;
}

const idFromUrl = url => Number(url.replace(/\/$/, '').split('/').pop());
const nameOf = (names, lang) => names.find(n => n.language.name === lang)?.name ?? '';

// ─── 1. 특별 분류 인덱스 ───────────────────────────────────────────────────────
async function buildSpecialIndex() {
  console.log('[1/2] pokemon-species 1025종 전설/환상 플래그 수집...');
  const tasks = Array.from({ length: MAX_DEX }, (_, i) => async () => {
    const s = await jget(`${API}/pokemon-species/${i + 1}`);
    return s ? { id: i + 1, legendary: !!s.is_legendary, mythical: !!s.is_mythical } : null;
  });
  const rows = (await runPool(tasks, CONCURRENCY, 'species')).filter(Boolean);

  const paradox = new Set(PARADOX_IDS);
  const ultra = new Set(ULTRA_BEAST_IDS);
  const exclude = new Set(EXCLUDE_IDS);
  const out = { legendary: [], mythical: [], paradox: [], ultraBeast: [] };

  // 우선순위: 울트라비스트 > 패러독스 > 환상 > 전설. (UB는 API상 legendary=true 라 먼저 걸러야 한다)
  for (const r of rows) {
    if (exclude.has(r.id)) continue;
    if (ultra.has(r.id)) out.ultraBeast.push(r.id);
    else if (paradox.has(r.id)) out.paradox.push(r.id);
    else if (r.mythical) out.mythical.push(r.id);
    else if (r.legendary) out.legendary.push(r.id);
  }

  writeFileSync(join(ROOT, 'src/data/pokedexSpecialIndex.json'), JSON.stringify(out));
  console.log(`  → pokedexSpecialIndex.json 전설 ${out.legendary.length} · 환상 ${out.mythical.length} · 패러독스 ${out.paradox.length} · UB ${out.ultraBeast.length}`);
  return out;
}

// ─── 2. 전용기술 인덱스 ────────────────────────────────────────────────────────
async function buildSignatureMoves() {
  console.log('[2/2] move 전수 조사 → 전용기술 추출...');
  const dex = JSON.parse(readFileSync(join(ROOT, 'src/data/pokedexTypeIndex.json'), 'utf8'));
  const dexById = new Map(dex.map(e => [e.id, e]));
  // 폼 이름이 종족 슬러그로 시작하는지 검사할 때 쓸 영문 슬러그(소문자).
  const slugById = new Map(dex.map(e => [e.id, e.en.toLowerCase()]));

  const list = await jget(`${API}/move?limit=2000`);
  // 10001+ 는 섀도우 기술(콜로세움) — 본편 전용기술 퀴즈에서 제외.
  const moveIds = list.results.map(r => idFromUrl(r.url)).filter(id => id < 10000);

  const tasks = moveIds.map(id => async () => {
    const m = await jget(`${API}/move/${id}`);
    if (!m) return null;
    const ko = nameOf(m.names, 'ko');
    const en = nameOf(m.names, 'en');
    if (!ko || !en) return null; // 한/영 이름이 모두 있어야 양쪽 언어 출제 가능

    const learners = m.learned_by_pokemon ?? [];
    const base = [...new Set(learners.map(p => idFromUrl(p.url)).filter(i => i <= MAX_DEX))];
    if (base.length !== 1) return null; // 정확히 한 종족만 배우는 기술
    const owner = base[0];
    const slug = slugById.get(owner);
    if (!slug) return null;

    // 폼(10000+) 학습자가 다른 종족의 폼이면 전용기술이 아니다 — 슬러그 접두사로 검사.
    const forms = learners.map(p => p.name.toLowerCase()).filter(n => n !== slug);
    if (forms.some(n => !n.startsWith(slug + '-'))) return null;

    return { m: id, ko, en, p: owner };
  });

  const rows = (await runPool(tasks, CONCURRENCY, 'moves')).filter(Boolean);
  rows.sort((a, b) => a.m - b.m);
  writeFileSync(join(ROOT, 'src/data/signatureMoves.json'), JSON.stringify(rows));
  console.log(`  → signatureMoves.json ${rows.length}건`);
  // 표본 출력(눈 검증용)
  for (const r of rows.slice(0, 5)) console.log(`     ${r.ko} / ${r.en} → ${dexById.get(r.p)?.ko}`);
  return rows;
}

const only = process.argv[2];
if (only !== 'moves') await buildSpecialIndex();
if (only !== 'special') await buildSignatureMoves();
console.log(failedCount ? `완료. (재시도 후에도 실패해 스킵한 요청 ${failedCount}건 — 재실행 권장)` : '완료.');
