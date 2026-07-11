// sim/tools/prefetch.sim.ts
// PokeAPI 전 데이터 레코딩 → 디스크 캐시 + 종족값 fixture 생성.
// 실행: npm run sim:prefetch   (SIM_HTTP=record 로만 동작; 평소 sim 실행에서는 skip)
//
// 수집 범위:
//   1) /pokemon/1..1025          — 종족값·타입·기술목록 (getStatOnly/getPokemon/getLearnableMoves 공용)
//   2) /pokemon-species/*        — 이름 현지화
//   3) /ability/*                — 특성 (getPokemon이 참조하는 것 전부)
//   4) /move/*                   — 레벨업 기술 + 픽커 후보 기술 전체 유니온
//   5) fixtures/stat-cache.json  — pokeAPI 로컬스토리지 캐시 원본
//      fixtures/weighted-list.json

import { describe, it } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import axios from 'axios';

const RECORD = process.env.SIM_HTTP === 'record';
const FIXTURE_DIR = path.resolve(__dirname, '../fixtures');
const MAX_ID = 1025;
const CONCURRENCY = 12;

async function pool<T>(tasks: Array<() => Promise<T>>, limit: number, label: string) {
  let idx = 0; let done = 0; let failed = 0;
  async function worker() {
    while (idx < tasks.length) {
      const cur = idx++;
      try { await tasks[cur](); } catch { failed++; }
      done++;
      if (done % 100 === 0) console.log(`[prefetch] ${label}: ${done}/${tasks.length} (실패 ${failed})`);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, tasks.length) }, worker));
  console.log(`[prefetch] ${label} 완료: ${done}/${tasks.length} (실패 ${failed})`);
}

describe.skipIf(!RECORD)('PokeAPI prefetch (record mode)', () => {
  it('전 포켓몬/기술/특성 데이터를 디스크 캐시에 레코딩한다', async () => {
    // pokeAPI는 bootstrap(폴리필+httpCache record 모드) 이후에 import해야 한다
    const { pokeAPI } = await import('../../src/api/pokeapi');

    // ── 1. 종족값 프리로드 (localStorage → fixture 파일로 덤프) ────────────
    await pokeAPI.preloadRarities((n, total) => {
      if (n % 200 === 0) console.log(`[prefetch] statOnly: ${n}/${total}`);
    });
    // ── 무결성 검증: statTotal이 0이면 레코딩이 깨진 것 (즉시 실패) ─────────
    const statDump: Array<{ id: number; statTotal: number }> =
      JSON.parse(localStorage.getItem('pokeapi_stat_cache_v2') ?? '[]');
    const broken = statDump.filter(s => !s.statTotal || s.statTotal <= 0);
    if (statDump.length < MAX_ID * 0.95 || broken.length > MAX_ID * 0.02) {
      throw new Error(
        `[prefetch] stat 레코딩 무결성 실패: 총 ${statDump.length}건, statTotal<=0 ${broken.length}건. ` +
        `sim/fixtures/http-cache 를 지우고 다시 실행하세요.`
      );
    }

    fs.mkdirSync(FIXTURE_DIR, { recursive: true });
    fs.writeFileSync(
      path.join(FIXTURE_DIR, 'stat-cache.json'),
      localStorage.getItem('pokeapi_stat_cache_v2') ?? '[]'
    );
    fs.writeFileSync(
      path.join(FIXTURE_DIR, 'weighted-list.json'),
      localStorage.getItem('pokeapi_weighted_list_v3') ?? '[]'
    );
    console.log('[prefetch] stat-cache/weighted-list fixture 저장 완료');

    // ── 2. 전 포켓몬 풀데이터 (pokemon + species + abilities) ──────────────
    //   + 특수폼(메가/거다이/융합/진화 타겟 중 1025 초과 id) — 웨이브끝 메가스톤 픽에 필요
    const { MEGA_EVOLUTIONS, GIGANTAMAX_FORMS, EVOLUTION_CHAINS, FUSION_DATA } =
      await import('../../src/data/evolution');
    const extraIds = new Set<number>();
    [...MEGA_EVOLUTIONS, ...GIGANTAMAX_FORMS, ...EVOLUTION_CHAINS].forEach((e: any) => {
      if (e.to > MAX_ID) extraIds.add(e.to);
    });
    (FUSION_DATA as any[]).forEach(f => { if (f.result > MAX_ID) extraIds.add(f.result); });
    console.log(`[prefetch] 특수폼 ${extraIds.size}종 추가`);

    const ids = [...Array.from({ length: MAX_ID }, (_, i) => i + 1), ...extraIds];
    await pool(ids.map(id => () => pokeAPI.getPokemon(id).then(() => undefined)), CONCURRENCY, 'getPokemon');

    // ── 3. 기술 유니온 수집 ────────────────────────────────────────────────
    //   a) 레벨업 기술 전부 (getLearnableMoves가 임의 레벨에서 요구 가능)
    //   b) 픽커 후보 기술 (PokemonData.moves 상위 20개 — 이미 level-up 우선 정렬)
    const moveNames = new Set<string>();
    for (const id of ids) {
      try {
        // 디스크 캐시에서 원시 pokemon 응답을 직접 읽는다 (추가 네트워크 없음)
        const raw = JSON.parse(fs.readFileSync(
          path.join(FIXTURE_DIR, 'http-cache', `pokemon_${id}.json`), 'utf8'
        )) as any;
        for (const m of raw.moves ?? []) {
          const isLevelUp = (m.version_group_details ?? []).some(
            (v: any) => v.move_learn_method?.name === 'level-up'
          );
          if (isLevelUp) moveNames.add(m.move.name);
        }
        const data = await pokeAPI.getPokemon(id); // 메모리 캐시 히트
        data.moves.slice(0, 20).forEach(n => moveNames.add(n));
      } catch { /* skip */ }
    }
    console.log(`[prefetch] 기술 유니온: ${moveNames.size}개`);
    await pool(
      Array.from(moveNames).map(name => () => pokeAPI.getMove(name).then(() => undefined)),
      CONCURRENCY, 'getMove'
    );

    // ── 4. 캐시 통계 출력 ─────────────────────────────────────────────────
    const cacheDir = path.join(FIXTURE_DIR, 'http-cache');
    const files = fs.readdirSync(cacheDir);
    const totalBytes = files.reduce((s, f) => s + fs.statSync(path.join(cacheDir, f)).size, 0);
    console.log(`[prefetch] 캐시 파일 ${files.length}개, ${(totalBytes / 1024 / 1024).toFixed(1)}MB`);
  });
});

// axios 미사용 경고 방지 (record 어댑터 설치 확인용 참조)
void axios;
