// sim/support/httpCache.ts
// PokeAPI 응답 디스크 캐시 — axios 어댑터 레벨에서 가로챈다.
//
// 모드:
//   offline(기본): 캐시 미스 시 즉시 에러 → 시뮬은 항상 네트워크 0으로 재현 가능
//   record       : 미스 시 실제 요청 후 슬림화하여 sim/fixtures/http-cache/ 에 저장
//
// 슬림화: PokeAPI 원본 응답은 개당 수백 KB(전 세대 version_group_details 포함).
// 게임 코드(src/api/pokeapi.ts)가 실제로 읽는 필드만 남겨 전체 캐시를 수십 MB → 수 MB로 압축.

import axios from 'axios';
import * as fs from 'fs';
import * as path from 'path';

const CACHE_DIR = path.resolve(__dirname, '../fixtures/http-cache');

export type HttpCacheMode = 'offline' | 'record';

function urlToFileName(url: string): string {
  // https://pokeapi.co/api/v2/pokemon/25 → pokemon_25.json (경로 마지막 두 세그먼트)
  const clean = url.replace(/\/+$/, '').replace(/^https?:\/\/[^/]+\/api\/v2\//, '');
  return clean.replace(/[^a-zA-Z0-9._-]/g, '_') + '.json';
}

// ── 언어 필터: names/flavor/genera/effect_entries에서 ko/en만 유지 ──────────
const keepLang = (arr: any[] | undefined) =>
  (arr ?? []).filter((e: any) => e?.language?.name === 'ko' || e?.language?.name === 'en');

/** 게임 코드가 읽는 필드만 남긴다. 알 수 없는 URL은 원본 유지. */
export function slimResponse(url: string, data: any): any {
  try {
    if (/\/pokemon\/[^/]+$/.test(url)) {
      return {
        id: data.id,
        name: data.name,
        height: data.height,
        weight: data.weight,
        stats: (data.stats ?? []).map((s: any) => ({ base_stat: s.base_stat })),
        types: (data.types ?? []).map((t: any) => ({ type: { name: t.type.name } })),
        species: { url: data.species?.url },
        sprites: {
          front_default: data.sprites?.front_default ?? null,
          other: { 'official-artwork': { front_default: data.sprites?.other?.['official-artwork']?.front_default ?? null } },
        },
        abilities: (data.abilities ?? []).map((a: any) => ({
          ability: { name: a.ability?.name, url: a.ability?.url },
        })),
        moves: (data.moves ?? []).map((m: any) => ({
          move: { name: m.move?.name },
          version_group_details: (m.version_group_details ?? []).map((v: any) => ({
            move_learn_method: { name: v.move_learn_method?.name },
            level_learned_at: v.level_learned_at,
          })),
        })),
      };
    }
    if (/\/pokemon-species\/[^/]+$/.test(url)) {
      return {
        names: keepLang(data.names),
        genera: keepLang(data.genera),
        flavor_text_entries: keepLang(data.flavor_text_entries).slice(0, 6),
      };
    }
    if (/\/move\/[^/]+$/.test(url)) {
      return {
        name: data.name,
        names: keepLang(data.names),
        power: data.power,
        accuracy: data.accuracy,
        effect_chance: data.effect_chance,
        type: { name: data.type?.name },
        damage_class: { name: data.damage_class?.name },
        target: { name: data.target?.name },
        effect_entries: keepLang(data.effect_entries).map((e: any) => ({
          language: e.language, short_effect: e.short_effect, effect: e.effect,
        })),
      };
    }
    if (/\/ability\/[^/]+$/.test(url)) {
      return {
        name: data.name,
        names: keepLang(data.names),
        effect_entries: keepLang(data.effect_entries).map((e: any) => ({
          language: e.language, short_effect: e.short_effect, effect: e.effect,
        })),
      };
    }
  } catch { /* 슬림화 실패 시 원본 유지 */ }
  return data;
}

let installed = false;
let cacheMode: HttpCacheMode = 'offline';
let missCount = 0;
let hitCount = 0;

export function getHttpCacheStats() { return { hitCount, missCount, mode: cacheMode }; }

export function installHttpCache(mode?: HttpCacheMode): void {
  cacheMode = mode ?? ((process.env.SIM_HTTP === 'record') ? 'record' : 'offline');
  if (installed) return;
  installed = true;

  // 실제 http 어댑터를 미리 확보 (record 모드용)
  const realAdapter = axios.getAdapter('http');

  axios.defaults.adapter = async (config) => {
    const url = axios.getUri(config);
    const file = path.join(CACHE_DIR, urlToFileName(url));

    if (fs.existsSync(file)) {
      hitCount++;
      const body = JSON.parse(fs.readFileSync(file, 'utf8'));
      return {
        data: body, status: 200, statusText: 'OK',
        headers: {}, config, request: {},
      };
    }

    missCount++;
    if (cacheMode === 'offline') {
      throw new Error(
        `[sim/httpCache] 캐시 미스(offline 모드): ${url}\n` +
        `  → 먼저 "npm run sim:prefetch" 로 PokeAPI 데이터를 받아 캐시를 만드세요.`
      );
    }

    const res = await realAdapter(config);
    // 어댑터 단계에서는 transformResponse(JSON.parse)가 아직 적용 전 — 문자열이면 직접 파싱
    let raw: any = res.data;
    if (typeof raw === 'string') {
      try { raw = JSON.parse(raw); } catch { /* JSON 아님 — 원본 유지 */ }
    }
    const slim = slimResponse(url, raw);
    fs.mkdirSync(CACHE_DIR, { recursive: true });
    fs.writeFileSync(file, JSON.stringify(slim));
    return { ...res, data: slim };
  };
}
