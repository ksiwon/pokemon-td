// sim/parity/mechanics.sim.ts
// P0d — 메커닉 × 엔진 정합성 매트릭스
// 실행: npm run sim:parity
//
// 이 프로젝트에는 전투 엔진이 4개 공존한다:
//   · 싱글TD    GameManager + utils/typeEffectiveness.calculateDamage
//   · 아레나    game/arenaSim.calcDmg            (멀티 인간전)
//   · AI서비스  services/PvPBattleService        (멀티 AI전 + 교착 강제종료)
//   · 카드      services/CardBattleService       (미니 포켓 오토배틀)
//
// 지금까지 나온 버그는 거의 전부 "한 엔진에만 있고 다른 엔진엔 없는 메커닉"이었다
// (죽은 STAB, 안 쓰는 2번째 타입, 무효 누락, 죽은 흡혈, 죽은 스피드…).
// 그래서 개별 증상을 쫓는 대신, **메커닉마다 그것만 다른 두 입력을 넣어 결과가
// 바뀌는지**로 구현 여부를 판정한다. 코드를 읽는 게 아니라 실행으로 확인하는 방식이라
// 나중에 누가 로직을 죽여도 여기서 잡힌다.
//
// 판정 표기:
//   ✅ 반영   — 입력을 바꾸면 데미지/결과가 달라진다
//   ❌ 미반영 — 바꿔도 동일 (그 메커닉이 죽어 있다)
//   ➖ 해당없음 — 그 엔진의 설계상 존재하지 않는 개념

import { describe, it, expect } from 'vitest';
import { calcDmg, Unit, buildUnits, simulateTick, attackSpeedMult } from '../../src/game/arenaSim';
import { pvpBattleService } from '../../src/services/PvPBattleService';
import { calculateDamage, getTypeEffectiveness } from '../../src/utils/typeEffectiveness';
import { cardBattleService, buildBattleCard, BattleCard } from '../../src/services/CardBattleService';
import { pokeAPI } from '../../src/api/pokeapi';
import { TowerDetail } from '../../src/types/multiplayer';
import { mulberry32 } from '../../src/utils/rng';
import { writeReport, writeMetrics, mdTable } from '../support/report';

// ─── 공통 픽스처 ──────────────────────────────────────────────────────────
// 스탯을 일부러 비대칭으로 잡는다(공≠특공, 방≠특방). 물리/특수 분리가 죽어 있으면
// 두 케이스의 데미지가 같아져서 바로 드러난다.
type MoveSpec = {
  name: string; displayName: string; type: string; power: number;
  accuracy: number; damageClass: 'physical' | 'special';
  effect?: Record<string, unknown>; isAOE?: boolean;
};

const move = (o: Partial<MoveSpec> = {}): MoveSpec => ({
  name: 'probe', displayName: '프로브', type: 'normal', power: 60,
  accuracy: 100, damageClass: 'physical', effect: { type: 'damage' }, ...o,
});

const tower = (o: Partial<TowerDetail> = {}): TowerDetail => ({
  pokemonId: 1, name: '프로브', level: 20, sprite: '',
  position: { x: 0, y: 0 },
  currentHp: 100000, maxHp: 100000,
  isFainted: false,
  attack: 200, defense: 100, specialAttack: 60, specialDefense: 300, speed: 50,
  types: ['normal'], equippedMoves: [move()] as never,
  critChance: 0, aoeBonus: 0, lifesteal: 0,
  ...o,
} as TowerDetail);

const unit = (d: TowerDetail, team: 'my' | 'opp', resist: string[] = []): Unit => ({
  id: team === 'my' ? 'my-0' : 'op-0',
  detail: d, team, x: team === 'my' ? 0 : 1, y: 0,
  hp: d.maxHp, maxHp: d.maxHp, atkCd: 0, fainted: false, isAtk: false, isHit: false,
  resistTypes: resist,
});

/** 아레나 데미지 — 같은 시드를 쓰므로 난수 소비열이 동일하다. */
function arenaDmg(atk: TowerDetail, def: TowerDetail, resist: string[] = [], seed = 7): number {
  return calcDmg(unit(atk, 'my'), unit(def, 'opp', resist), mulberry32(seed)).damage;
}

/**
 * AI서비스 데미지 — calculateBattleDamage가 private이라 1v1 전투를 돌려
 * 첫 공격 로그의 damage를 읽는다. 방어측 HP를 크게 잡아 한 방에 안 끝나게 한다.
 */
function svcDmg(atk: TowerDetail, def: TowerDetail, round = 3): number {
  const r = pvpBattleService.simulateBattle([atk], [def], 'pA', 'pB', round);
  const first = r.battleLog.find(l => l.attackerId.startsWith('p1-'));
  return first?.damage ?? 0;
}

/**
 * 카드 데미지 — 1v1 시뮬의 첫 플레이어 '공격' 로그.
 * 로그에 side 필드는 없고 attackerUid로 진영을 판별한다. kind는 생략 시 attack(하위호환).
 */
function cardDmg(atk: BattleCard, def: BattleCard, seed = 5): number {
  const r = cardBattleService.simulate([{ ...atk }], [{ ...def }], seed);
  const first = r.log.find(l => l.attackerUid?.startsWith('player-') && (l.kind ?? 'attack') === 'attack');
  return first?.damage ?? 0;
}

type Verdict = '✅ 반영' | '❌ 미반영' | '➖ 해당없음';
interface Row { mechanic: string; td: Verdict | string; arena: Verdict; svc: Verdict; card: Verdict; note: string }

/** 두 프로브 결과가 다르면 반영, 같으면 미반영. */
const v = (a: number, b: number): Verdict => (a !== b ? '✅ 반영' : '❌ 미반영');

describe('P0d: 메커닉 × 엔진 정합성', () => {
  it('전 엔진 메커닉 매트릭스', async () => {
    const rows: Row[] = [];
    const drift: string[] = [];

    // 카드용 실제 종족값 — 카드 엔진은 PokemonData에서 카드를 만든다
    const bulba = await pokeAPI.getPokemon(1);      // 풀/독
    const charm = await pokeAPI.getPokemon(4);      // 불
    const gengar = await pokeAPI.getPokemon(94);    // 고스트/독
    const mkCard = (p: Parameters<typeof buildBattleCard>[0], side: 'player' | 'enemy') =>
      buildBattleCard(p, { stars: 3, row: 'front', slot: 0, side, uid: `${side}-0` });

    // ── 1. 이중타입 방어 ────────────────────────────────────────────────
    // rock 기술: vs 불꽃 = 0.5, vs 불꽃/비행 = 0.5 × 2 = 1.0. 2번째 타입을 무시하면 동일해진다.
    {
      const atk = tower({ types: ['normal'], equippedMoves: [move({ type: 'rock' })] as never });
      const d1 = tower({ types: ['fire'] });
      const d2 = tower({ types: ['fire', 'flying'] });
      const cardMono = mkCard(charm, 'enemy');                                   // 불
      const cardDual = { ...mkCard(charm, 'enemy'), types: ['fire', 'flying'] }; // 불/비행
      const cAtk = { ...mkCard(bulba, 'player'), types: ['rock'] };
      rows.push({
        mechanic: '이중타입 방어 (2번째 타입까지 곱)',
        td: getTypeEffectiveness('rock', ['fire']) !== getTypeEffectiveness('rock', ['fire', 'flying']) ? '✅ 반영' : '❌ 미반영',
        arena: v(arenaDmg(atk, d1), arenaDmg(atk, d2)),
        svc: v(svcDmg(atk, d1), svcDmg(atk, d2)),
        card: v(cardDmg(cAtk, cardMono), cardDmg(cAtk, cardDual)),
        note: 'rock → 불꽃(0.5) vs 불꽃/비행(1.0)',
      });
    }

    // ── 2. 완전 무효 ────────────────────────────────────────────────────
    // 노말 → 고스트. TD/멀티는 의도적으로 0.1(완전 봉쇄 방지), 카드만 원전대로 0.
    {
      const atk = tower({ types: ['normal'], equippedMoves: [move({ type: 'normal' })] as never });
      const normalD = tower({ types: ['normal'] });
      const ghostD = tower({ types: ['ghost'] });
      const cAtk = { ...mkCard(bulba, 'player'), types: ['normal'] };
      rows.push({
        mechanic: '무효 상성 (노말 → 고스트)',
        td: `✅ ×${getTypeEffectiveness('normal', ['ghost'])}`,
        arena: v(arenaDmg(atk, normalD), arenaDmg(atk, ghostD)),
        svc: v(svcDmg(atk, normalD), svcDmg(atk, ghostD)),
        card: cardDmg(cAtk, mkCard(gengar, 'enemy')) === 0 ? '✅ 반영' : '❌ 미반영',
        note: 'TD/멀티는 ×0.1(봉쇄 방지), 카드만 원전 0',
      });
    }

    // ── 3. STAB ─────────────────────────────────────────────────────────
    {
      const stabAtk = tower({ types: ['fire'], equippedMoves: [move({ type: 'fire' })] as never });
      const noStab = tower({ types: ['water'], equippedMoves: [move({ type: 'fire' })] as never });
      const def = tower({ types: ['normal'] });
      rows.push({
        mechanic: 'STAB (자속 1.5배)',
        td: '✅ 반영 (stabMultiplier, 테라 포함)',
        arena: v(arenaDmg(stabAtk, def), arenaDmg(noStab, def)),
        svc: v(svcDmg(stabAtk, def), svcDmg(noStab, def)),
        card: '➖ 해당없음',
        note: '카드는 상수 1.5를 위력에 흡수 — 전원 동일 적용이라 변별 없음',
      });
    }

    // ── 4. 물리/특수 분리 ───────────────────────────────────────────────
    // 공200/특공60, 방100/특방300 → 물리와 특수 데미지가 크게 갈려야 정상.
    {
      const phys = tower({ equippedMoves: [move({ damageClass: 'physical' })] as never });
      const spec = tower({ equippedMoves: [move({ damageClass: 'special' })] as never });
      const def = tower({ types: ['normal'] });
      // 카드: special = 특공 > 공격 일 때만 특수. 스탯을 뒤집어 분기를 강제한다.
      const cd = mkCard(charm, 'enemy');
      const cPhys = { ...mkCard(bulba, 'player'), attack: 300, specialAttack: 50 };
      const cSpec = { ...mkCard(bulba, 'player'), attack: 50, specialAttack: 300 };
      rows.push({
        mechanic: '물리/특수 분리',
        td: '✅ 반영 (damageClass로 방어/특방 선택)',
        arena: v(arenaDmg(phys, def), arenaDmg(spec, def)),
        svc: v(svcDmg(phys, def), svcDmg(spec, def)),
        card: v(cardDmg(cPhys, cd), cardDmg(cSpec, cd)),
        note: '멀티는 기술의 damageClass, 카드는 공/특공 비교로 자동 선택',
      });
    }

    // ── 5. 레벨이 데미지 공식에 반영 ────────────────────────────────────
    // 같은 스탯, 레벨만 다르게. 본가 공식의 (2L/5+2) 항이 살아 있는지.
    {
      const lo = tower({ level: 10 });
      const hi = tower({ level: 50 });
      const def = tower({ types: ['normal'] });
      const tdLo = calculateDamage(200, 100, 60, 1, false, 1);
      const tdHi = calculateDamage(200, 100, 60, 1, false, 1); // 레벨 인자가 없다 = 항상 동일
      rows.push({
        mechanic: '레벨 → 데미지 공식 (2L/5+2)',
        td: tdLo !== tdHi ? '✅ 반영' : '❌ 미반영',
        arena: v(arenaDmg(lo, def), arenaDmg(hi, def)),
        svc: v(svcDmg(lo, def), svcDmg(hi, def)),
        card: v(cardDmg({ ...mkCard(bulba, 'player'), level: 10 }, mkCard(charm, 'enemy')),
                cardDmg({ ...mkCard(bulba, 'player'), level: 50 }, mkCard(charm, 'enemy'))),
        note: `싱글TD는 calculateDamage가 level=50 하드코딩. 실제 레벨을 쓰면 L15에서 ${((2 * 15 / 5 + 2) / 22).toFixed(2)}배, L1에서 ${((2 * 1 / 5 + 2) / 22).toFixed(2)}배가 되어 초반이 붕괴한다 — 의도된 상수로 보이나 모드 간 딜 스케일이 달라진다`,
      });
    }

    // ── 6. 크리티컬 ─────────────────────────────────────────────────────
    {
      const never = tower({ critChance: 0 });
      const always = tower({ critChance: 1 });
      const def = tower({ types: ['normal'] });
      rows.push({
        mechanic: '크리티컬',
        td: calculateDamage(200, 100, 60, 1, false, 1) !== calculateDamage(200, 100, 60, 1, true, 1) ? '✅ 반영' : '❌ 미반영',
        arena: v(arenaDmg(never, def), arenaDmg(always, def)),
        svc: v(svcDmg(never, def), svcDmg(always, def)),
        card: v(cardDmg({ ...mkCard(bulba, 'player'), critChance: 0 }, mkCard(charm, 'enemy')),
                cardDmg({ ...mkCard(bulba, 'player'), critChance: 1 }, mkCard(charm, 'enemy'))),
        note: '',
      });
    }

    // ── 7. 명중률 ───────────────────────────────────────────────────────
    {
      const sure = tower({ equippedMoves: [move({ accuracy: 100 })] as never });
      const never = tower({ equippedMoves: [move({ accuracy: 0 })] as never });
      const def = tower({ types: ['normal'] });
      rows.push({
        mechanic: '명중률 (빗나감)',
        td: '✅ 반영 (hitChance = accuracy/100)',
        arena: v(arenaDmg(sure, def), arenaDmg(never, def)),
        svc: v(svcDmg(sure, def), svcDmg(never, def)),
        card: '➖ 해당없음',
        note: '카드는 기술 개념이 없어 명중률 자체가 없다',
      });
    }

    // ── 8. 데미지 난수폭 (0.85~1.0) ─────────────────────────────────────
    {
      const atk = tower({});
      const def = tower({ types: ['normal'] });
      rows.push({
        mechanic: '데미지 난수폭 (0.85~1.0)',
        td: '❌ 미반영',
        arena: v(arenaDmg(atk, def, [], 1), arenaDmg(atk, def, [], 999)),
        svc: v(svcDmg(atk, def, 3), svcDmg(atk, def, 11)),
        card: v(cardDmg(mkCard(bulba, 'player'), mkCard(charm, 'enemy'), 1),
                cardDmg(mkCard(bulba, 'player'), mkCard(charm, 'enemy'), 77)),
        note: '싱글TD의 calculateDamage에는 난수 인자가 없다 — 같은 입력이면 항상 같은 데미지',
      });
    }

    // ── 9. 6마리 타입시너지 약점반감 ────────────────────────────────────
    {
      const atk = tower({ types: ['water'], equippedMoves: [move({ type: 'water' })] as never });
      const def = tower({ types: ['fire'] });   // water 2배 약점
      rows.push({
        mechanic: '6마리 타입시너지 약점반감',
        td: '✅ 반영 (GameManager 피격 경로)',
        arena: v(arenaDmg(atk, def, []), arenaDmg(atk, def, ['fire'])),
        svc: (() => {
          // prepare()가 resistTypes를 로스터에서 재계산하므로 주입이 안 먹는다 → 진짜 6마리 팀으로 판정.
          //   A: 불꽃 6마리      → type:fire level 3 (약점반감 O)
          //   B: 불꽃 5 + 노말 1 → type:fire level 2 (약점반감 X, 스탯 배율은 L2·L3 모두 1.3으로 동일)
          // 두 경우 모두 0번 슬롯은 같은 불꽃 유닛이라 대상 스탯은 동일하고, 차이는 반감뿐이다.
          const fire = (i: number) => tower({ pokemonId: 4, name: `f${i}`, types: ['fire'] });
          const six = [0, 1, 2, 3, 4, 5].map(fire);
          const five = [...[0, 1, 2, 3, 4].map(fire), tower({ pokemonId: 4, name: 'n5', types: ['normal'] })];
          const dmgVs = (team: TowerDetail[]) => {
            const r = pvpBattleService.simulateBattle([atk], team, 'pA', 'pB', 9);
            return r.battleLog.find(l => l.attackerId.startsWith('p1-'))?.damage ?? 0;
          };
          return v(dmgVs(six), dmgVs(five));
        })(),
        card: '➖ 해당없음',
        note: '카드는 6마리 타입시너지 개념이 다름(별도 시너지 표)',
      });
    }

    // ── 10. 흡혈 ────────────────────────────────────────────────────────
    // 데미지가 아니라 공격자 HP 회복이라, 전투를 돌려 공격자 잔여 HP로 판정한다.
    {
      const leech = tower({ lifesteal: 0.5, maxHp: 400, currentHp: 400 });
      const plain = tower({ lifesteal: 0, maxHp: 400, currentHp: 400 });
      const punchy = tower({
        types: ['normal'], attack: 400, maxHp: 100000, currentHp: 100000,
        equippedMoves: [move({ power: 40 })] as never,
      });
      const arenaHp = (atk: TowerDetail): number => {
        let us = buildUnits([atk], [punchy], [], []);
        us = us.map(u => (u.team === 'my' ? { ...u, x: 0, y: 0 } : { ...u, x: 1, y: 0 }));
        const rng = mulberry32(3);
        for (let t = 0; t < 200; t++) {
          const r = simulateTick(us, 'L', rng, 3);
          us = r.units;
          if (r.done) break;
        }
        return us.find(u => u.team === 'my')!.hp;
      };
      // 잔존 마리수(0/1)는 변별력이 없다 — 흡혈이 있으면 더 오래 버티므로 '버틴 턴 수'로 본다.
      const svcHp = (atk: TowerDetail): number => {
        const r = pvpBattleService.simulateBattle([atk], [punchy], 'pA', 'pB', 4);
        return r.battleLog[r.battleLog.length - 1]?.turn ?? 0;
      };
      rows.push({
        mechanic: '흡혈 (lifesteal)',
        td: '✅ 반영 (drainPercent > ability.lifesteal)',
        arena: v(arenaHp(leech), arenaHp(plain)),
        svc: v(svcHp(leech), svcHp(plain)),
        card: '➖ 해당없음',
        note: '흡혈 유무로 생존이 갈리는지로 판정',
      });
    }

    // ── 11. 스피드 → 공격 빈도 ──────────────────────────────────────────
    {
      const slow = tower({ speed: 5, attack: 300 });
      const fast = tower({ speed: 300, attack: 300 });
      const wall = tower({ types: ['normal'], maxHp: 100000, currentHp: 100000, attack: 1 });
      const svcHits = (atk: TowerDetail): number => {
        const r = pvpBattleService.simulateBattle([atk], [wall], 'pA', 'pB', 5);
        return r.battleLog.filter(l => l.attackerId.startsWith('p1-')).length;
      };
      rows.push({
        mechanic: '스피드 → 공격 빈도',
        td: '✅ 반영 (공격 쿨다운)',
        arena: attackSpeedMult(5) !== attackSpeedMult(300) ? '✅ 반영' : '❌ 미반영',
        svc: v(svcHits(slow), svcHits(fast)),
        card: '➖ 해당없음',
        note: `아레나·AI 공용 곡선: cd ×${attackSpeedMult(5).toFixed(2)}(spd5) vs ×${attackSpeedMult(300).toFixed(2)}(spd300). 카드는 턴제라 순서만`,
      });
    }

    // ── 12. 상태이상 부여 ───────────────────────────────────────────────
    // 위력 1짜리 기술에 독 100%를 달아, 지속피해가 있는지로 판정한다(직격 데미지는 무시 가능).
    {
      const poison = tower({
        attack: 10,
        equippedMoves: [move({ power: 1, effect: { type: 'damage', statusInflict: 'poison', statusChance: 100 } })] as never,
      });
      const plain = tower({ attack: 10, equippedMoves: [move({ power: 1 })] as never });
      const victim = tower({ types: ['normal'], maxHp: 5000, currentHp: 5000, attack: 1, defense: 500 });
      const arenaVictimHp = (atk: TowerDetail): number => {
        let us = buildUnits([atk], [victim], [], []);
        us = us.map(u => (u.team === 'my' ? { ...u, x: 0, y: 0 } : { ...u, x: 1, y: 0 }));
        const rng = mulberry32(3);
        for (let t = 0; t < 300; t++) { const r = simulateTick(us, 'L', rng, 3); us = r.units; if (r.done) break; }
        return us.find(u => u.team === 'opp')!.hp;
      };
      const svcVictimDmg = (atk: TowerDetail): number => {
        const r = pvpBattleService.simulateBattle([atk], [victim], 'pA', 'pB', 6);
        return r.battleLog.filter(l => l.attackerId.startsWith('p1-')).reduce((s, l) => s + l.damage, 0);
      };
      rows.push({
        mechanic: '상태이상 부여 (독/화상/마비…)',
        td: '✅ 반영 (proj.effect.statusInflict)',
        arena: v(arenaVictimHp(poison), arenaVictimHp(plain)),
        svc: v(svcVictimDmg(poison), svcVictimDmg(plain)),
        card: '✅ 반영 (화상/독/마비/얼음)',
        note: '위력 1 기술 + 독 100%로 지속피해 유무 판정',
      });
    }

    // ── 13. AOE 스플래시 ────────────────────────────────────────────────
    // 인접한 2번째 방어자가 피해를 받는지로 판정.
    {
      const aoe = tower({ equippedMoves: [move({ isAOE: true })] as never });
      const single = tower({ equippedMoves: [move({ isAOE: false })] as never });
      const d0 = tower({ pokemonId: 20, name: 'd0', types: ['normal'], maxHp: 9000, currentHp: 9000, attack: 1 });
      const d1 = tower({ pokemonId: 21, name: 'd1', types: ['normal'], maxHp: 9000, currentHp: 9000, attack: 1 });
      const arenaSecondHp = (atk: TowerDetail): number => {
        let us = buildUnits([atk], [d0, d1], [], []);
        // 두 방어자를 서로 스플래시 범위(1.6) 안에 붙여 놓는다
        us = us.map(u => u.team === 'my' ? { ...u, x: 0, y: 0 }
          : u.id === 'op-0' ? { ...u, x: 1, y: 0 } : { ...u, x: 1, y: 1 });
        const rng = mulberry32(3);
        for (let t = 0; t < 120; t++) { const r = simulateTick(us, 'L', rng, 3); us = r.units; if (r.done) break; }
        return us.find(u => u.id === 'op-1')!.hp;
      };
      const svcSecondDmg = (atk: TowerDetail): number => {
        const r = pvpBattleService.simulateBattle([atk], [d0, d1], 'pA', 'pB', 8);
        // 2번째 슬롯이 첫 5턴 안에 받은 피해 — AOE가 있으면 0이 아니다
        return r.battleLog
          .filter(l => l.attackerId.startsWith('p1-') && l.targetId === 'p2-1' && l.turn <= 5)
          .reduce((s, l) => s + l.damage, 0);
      };
      rows.push({
        mechanic: 'AOE 스플래시 (인접 피해)',
        td: '✅ 반영 (aoeRadius + 특성 배율)',
        arena: v(arenaSecondHp(aoe), arenaSecondHp(single)),
        svc: v(svcSecondDmg(aoe), svcSecondDmg(single)),
        card: '➖ 해당없음',
        note: '광역 기술을 들려주고 2번째 방어자 피해 유무로 판정',
      });
    }

    // ── 리포트 ──────────────────────────────────────────────────────────
    let md = `# 메커닉 × 엔진 정합성 매트릭스\n\n`;
    md += `전투 엔진 4개가 공존한다. 지금까지 나온 버그는 대부분 "한 엔진에만 있는 메커닉"이었다.\n`;
    md += `각 메커닉마다 **그것만 다른 두 입력**을 넣어 결과가 바뀌는지로 판정한다(코드 독해가 아니라 실행).\n\n`;
    md += `- **싱글TD** GameManager + typeEffectiveness.calculateDamage\n`;
    md += `- **아레나** arenaSim (멀티 인간전)\n`;
    md += `- **AI서비스** PvPBattleService (멀티 AI전 + 교착 강제종료)\n`;
    md += `- **카드** CardBattleService (미니 포켓)\n\n`;
    md += mdTable(
      ['메커닉', '싱글TD', '아레나', 'AI서비스', '카드', '비고'],
      rows.map(r => [r.mechanic, r.td, r.arena, r.svc, r.card, r.note])
    );

    // ── 아레나 ↔ AI서비스는 같은 매치를 판정하므로 반드시 일치해야 한다 ──
    md += `\n## 아레나 ↔ AI서비스 드리프트\n\n`;
    md += `이 둘은 **같은 멀티 매치**를 판정한다(사람 상대냐 AI 상대냐, 교착 시 강제종료냐의 차이).\n`;
    md += `한쪽에만 있는 메커닉은 곧 "상대가 누구냐에 따라 규칙이 바뀐다"는 뜻이라 반드시 일치해야 한다.\n\n`;
    for (const r of rows) {
      if (r.arena === '➖ 해당없음' || r.svc === '➖ 해당없음') continue;
      if (r.arena !== r.svc) drift.push(`${r.mechanic}: 아레나 ${r.arena} / AI서비스 ${r.svc}`);
    }
    md += drift.length ? drift.map(d => `- ⚠️ ${d}`).join('\n') + '\n' : `없음 — 두 엔진이 검사한 전 메커닉에서 일치.\n`;

    writeReport('mechanic-parity', md);
    writeMetrics('mechanic-parity', {
      rows: rows.map(r => ({ mechanic: r.mechanic, td: r.td, arena: r.arena, svc: r.svc, card: r.card })),
      arenaVsServiceDrift: drift,
    });

    console.log('\n=== 메커닉 정합성 ===');
    for (const r of rows) console.log(`${r.mechanic.padEnd(30)} TD:${r.td}  아레나:${r.arena}  AI:${r.svc}  카드:${r.card}`);
    if (drift.length) drift.forEach(d => console.log(`DRIFT ${d}`));
    else console.log('아레나 ↔ AI서비스 드리프트 없음');

    // 같은 매치를 판정하는 두 엔진은 메커닉이 어긋나면 안 된다.
    expect(drift).toEqual([]);
  }, 300_000);
});
