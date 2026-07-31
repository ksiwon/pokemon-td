// sim/net/clientKit.ts
// 클라이언트 격리 — "두 사람이 각자 브라우저를 켠 상태"를 한 프로세스 안에 만든다.
//
// 문제: multiplayerService / useGameStore / authService 는 전부 모듈 싱글턴이다.
//   그냥 두 번 쓰면 두 플레이어가 같은 스토어·같은 스로틀 맵·같은 로그인 유저를 공유한다
//   (= 검증하려는 대상인 "클라이언트 간 상태 불일치"가 원천적으로 발생할 수 없다).
// 해결: 클라이언트마다 vi.resetModules() 후 동적 import → **모듈 그래프 자체를 분리**한다.
//   공유되어야 하는 것(인메모리 RTDB, 가상 시계)만 globalThis 에 둔다(sim/net/rtdb.ts).
//
// 부작용으로 pokeAPI 싱글턴도 클라이언트마다 새로 뜨지만, 캐시는 localStorage fixture 라
// 네트워크는 여전히 0이다(bootstrap.ts).

import { vi } from 'vitest';
import type { SimUser } from '../support/mocks/AuthService';

export interface ClientModules {
  clientId: string;
  user: SimUser;
  multiplayerService: any;
  authService: any;
  useGameStore: any;
  pvpBattleService: any;
  deriveBattleSeed: (round: number, a: string, b: string) => number;
  buildTowerDetails: (towers: any[]) => any[];
  /** 와이어 특성 → 로컬 특성. 재접속 복원 미러가 쓴다(GameLayout 과 같은 함수). */
  fromWireAbility: (a: any) => any;
  arena: typeof import('../pvp/arenaRunner');
  net: typeof import('./rtdb');
}

export interface SpawnOptions {
  /** 편도 지연(ms). 왕복은 2배. */
  latencyMs?: number;
  /** 서버 시각 - 이 클라 시각. 페이즈 타이머 어긋남 재현용. */
  clockSkewMs?: number;
}

export function makeUser(uid: string, rating = 1000): SimUser {
  return {
    uid,
    email: `${uid}@sim.local`,
    displayName: uid,
    photoURL: '',
    rating,
    createdAt: 1_760_000_000_000,
  };
}

/**
 * 독립 모듈 그래프를 하나 띄운다.
 * ⚠ 반드시 순차 호출할 것 — globalThis 로 클라이언트 정체성을 넘기므로 동시 호출은 섞인다.
 */
export async function spawnClient(
  clientId: string,
  user: SimUser,
  opts: SpawnOptions = {},
): Promise<ClientModules> {
  const G = globalThis as any;
  vi.resetModules();
  G.__SIM_CLIENT_ID = clientId;
  G.__SIM_CLIENT_OPTS = opts;
  G.__SIM_AUTH_USER = user;
  try {
    const net = await import('./rtdb');
    net.registerClient(clientId, opts);

    const [msMod, authMod, storeMod, pvpMod, towerMod, arenaMod, abilMod] = await Promise.all([
      import('../../src/services/MultiplayerService'),
      import('../support/mocks/AuthService'),
      import('../../src/store/gameStore'),
      import('../../src/services/PvPBattleService'),
      import('../../src/game/towerFactory'),
      import('../pvp/arenaRunner'),
      import('../../src/utils/abilities'),
    ]);

    return {
      clientId,
      user,
      multiplayerService: (msMod as any).multiplayerService,
      authService: (authMod as any).authService,
      useGameStore: (storeMod as any).useGameStore,
      pvpBattleService: (pvpMod as any).pvpBattleService,
      deriveBattleSeed: (pvpMod as any).deriveBattleSeed,
      buildTowerDetails: (towerMod as any).buildTowerDetails,
      fromWireAbility: (abilMod as any).fromWireAbility,
      arena: arenaMod as any,
      net: net as any,
    };
  } finally {
    delete G.__SIM_CLIENT_ID;
    delete G.__SIM_CLIENT_OPTS;
    delete G.__SIM_AUTH_USER;
  }
}
