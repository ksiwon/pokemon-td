# 밸런스 시뮬레이션 하네스 (sim/)

싱글/멀티 밸런스를 헤드리스로 대량 시뮬레이션하고, 밸런스 변경 전후를 자동 비교하는 장치.
**실제 게임 코드를 그대로 구동**한다 — 별도 간이 모델이 아니므로 드리프트가 없다.

## 빠른 시작

```bash
npm run sim:prefetch   # 최초 1회: PokeAPI 데이터 레코딩 (~1분, 이후 오프라인)
npm run sim            # 전체 시뮬 실행 → sim/reports/current/*.md
```

## 밸런스 변경 워크플로 ("변경 전 비교표 먼저"의 자동화)

```bash
npm run sim            # 1) 현재 상태 측정
npm run sim:baseline   # 2) 기준선으로 저장
# 3) 밸런스 상수 수정 (WaveSystem 배율, battleRewards 커브, heldItems 등)
npm run sim            # 4) 재측정
npm run sim:report     # 5) sim/reports/current/balance-compare.md 에 전후 비교표
```

## 시뮬 목록

| 명령 | 내용 | 산출 리포트 |
|---|---|---|
| `sim:pvp` | 대표 보드 8종 풀리그 (AI매치 엔진) — 승률 매트릭스·골드효율·선공이점 | `pvp-matrix.md` |
| `sim:placement` | 아레나 배치 민감도 — 무작위 배치 스프레드 vs 역할배치 효과 | `arena-placement.md` |
| `sim:cross` | 두 전투엔진(PvPBattleService vs arenaSim) 승자 일치율·뒤집힘 쌍 | `engine-cross-validation.md` |
| `sim:single` | 싱글 50웨이브 몬테카를로 — 페르소나×맵×시드 | `single-runs.md` |
| `sim:multi` | 멀티 8인 팟 — 게임 길이·라이프 손실 출처·데스스파이럴·연패EV | `multi-runs.md` |
| `sim:2p` | **2인 멀티 프로토콜** — 실 MultiplayerService를 인메모리 RTDB 위에서 구동 | `multi-2p-protocol.md`, `multi-2p-wire.md` |
| `sim:2p:rtdb` | 가짜 RTDB가 실제 RTDB 규칙을 지키는지 (상위 결론의 전제) | — |
| `sim:2p:lobby` | 방 생성/참가/시작/퇴장 수명주기 | — |
| `sim:2p:wire` | 보드가 Firebase를 왕복할 때 무엇이 사라지는가 | `multi-2p-wire.md` |
| `sim:2p:quiz` | **퀴즈 속도전 2인** — 정답·답안이 방에 새지 않는가, 채점 결과만 방송되는가 | — |
| `sim:report` | 위 지표들을 baseline과 전후 비교 | `balance-compare.md` |

환경변수로 규모 조절: `SIM_SEEDS`(싱글 시드 수), `SIM_MAPS`, `SIM_PERSONAS`,
`SIM_MAX_WAVES`, `SIM_GAMES`(멀티 게임 수), `SIM_MULTI_MAP`, `SIM_ENGINE`(arena|service).

```bash
# 예: 싱글 정밀 측정 (10시드 × 4페르소나 × 2맵)
SIM_SEEDS=10 npm run sim:single
```

## 봇 페르소나 (개발자 문답 기반 실플레이 재현)

- **holdout(버티기형)**: 내구형으로 6칸 채우고 존버, 잉여골드는 캐리 사탕
- **reroller(리롤형)**: 몸 4개 확보 후 20G 픽커를 돌려 BST 520+ 를 노림, 뽑으면 경험사탕 캐치업
- **worker(알바형)**: 웨이브 12+ 파티 안정 시 1마리 알바 파견 → 지닌도구 구매
- **tera(테라형)**: 맵 테라타입 위주 구매 + 캐리를 테라타일에 배치
- **lossStreaker(연패형, 멀티)**: 최소 투자·골드 비축 → 라이프 25 이하에서 스파이크

## 아키텍처

```
sim/
  support/
    bootstrap.ts     vitest setup: localStorage 폴리필, 언어 고정, fixture 주입, HTTP 캐시
    httpCache.ts     axios 어댑터 디스크 캐시 (offline 기본 / record 모드)
    mocks/           firebase·AuthService·DatabaseService 대체 (alias로 치환)
    teamBuilder.ts   보드 생성 — towerFactory·성장공식·buildTowerDetails 실코드 재사용
    report.ts        md/metrics 저장, baseline 비교
  fixtures/          stat-cache.json(커밋) + http-cache/(gitignore, sim:prefetch로 재생성)
  pvp/               P0: boards.ts(아키타입) · pvpMatrix · arenaRunner · placement · crossValidate
  single/            P1: runner.ts(헤드리스 게임루프) · botPolicies.ts(페르소나) · single.sim.ts
  multi/             P2: orchestrator.ts(페이즈머신 로컬재현) · multi.sim.ts
  net/               인메모리 RTDB(rtdb.ts) + 클라이언트 모듈그래프 격리(clientKit.ts)
  multi2/            P-2/P-3: 2인 프로토콜 — client.ts(헤드리스 클라) · match.ts(러너+불변식)
                     · twoPlayer/lobby/rtdbSemantics/wireFidelity.sim.ts
  report/            종합 전후 비교 생성기
  tools/             prefetch(레코딩) · baseline.mjs
```

### 실코드 공유 지점 (시뮬 = 실게임 보장)

- 전투(PvE): `GameManager.update` + `WaveSystem` 그대로 (fake timers로 가속)
- 전투(PvP 인간전): `src/game/arenaSim.ts` — TFTBattleArena에서 추출, 컴포넌트도 이걸 씀
- 전투(PvP AI전): `PvPBattleService.simulateBattle` 그대로
- 구매/기술/특성: `src/game/towerFactory.ts` — PokemonPicker도 이걸 씀
- 보상: `src/services/battleRewards.ts` — MultiplayerService도 이걸 씀
- 매칭/bye: `PvPBattleService.generateMatchups` 그대로
- 방·페이즈·트랜잭션: `MultiplayerService` **전체** (sim/multi2 한정 — 아래 참조)
- 퀴즈 속도전 방: `QuizRoomService` **전체** (sim/multi2/quizSpeed.sim.ts — 위와 같은 인메모리 RTDB)

### 결정론

`src/utils/rng.ts` 의 `rng()` 가 게임로직 전체의 난수원 (기본 Math.random — 프로덕션 불변).
시뮬은 `setRngSource(mulberry32(seed))` 로 교체 + vitest fake timers(Date 포함) + HTTP 디스크
캐시 → **같은 시드는 항상 같은 결과** (single.sim.ts 의 결정론 테스트가 회귀 감시).

## 2인 멀티 프로토콜 하네스 (sim/multi2 + sim/net)

`sim/multi`(8인 팟)는 페이즈 머신을 **로컬에서 다시 구현해** 우회한다 — 밸런스를 재는 데는
그걸로 충분하지만, 그 결과 `MultiplayerService` 1500줄(방·페이즈·트랜잭션·스로틀·정리)은
시뮬에서 한 줄도 실행된 적이 없었다. `sim/multi2`가 그 공백을 메운다.

- `sim/net/rtdb.ts` — `firebase/database` 자리를 그대로 대체하는 인메모리 RTDB.
  null 프루닝(빈 배열/객체 = 노드 삭제), 배열↔객체 강제, undefined 거부, push 정렬키,
  **로컬 캐시 트리 기반 트랜잭션 재시도**, `onValue`의 동기 첫 발화, 쿼리, `onDisconnect`,
  오프라인 큐를 재현한다. 클라이언트별 지연·시계오차 주입.
- `sim/net/clientKit.ts` — 클라이언트마다 `vi.resetModules()` + 동적 import 로
  **모듈 그래프를 분리**한다. 두 플레이어가 각자의 `gameStore`/`multiplayerService`를 갖고,
  공유하는 것은 RTDB 하나뿐 — 실제 브라우저 두 대와 같은 구조.
- `sim/multi2/client.ts` — `GameLayout` + `BattlePhaseUI`의 **프로토콜 미러**.
  ⚠ 컴포넌트의 멀티 흐름을 고치면 여기도 같이 고쳐야 한다(arenaRunner ↔ TFTBattleArena와 동일 계약).
- `sim/multi2/match.ts` — 시나리오 러너 + 불변식 11종(라운드 단조성, 결과 유일성,
  양측 로컬 결과 일치, 아레나 입력 동일성, 보상 중복/누락, 보상 정산 완결, 고아 노드 등).
- `sim/multi2/quizSpeed.sim.ts` — **퀴즈 속도전**도 같은 하네스를 쓴다. TD와 목적이 다르다:
  여기서 보는 건 밸런스가 아니라 **"안 보여야 하는 것이 안 보이는가"** 다. 정답(accept)과
  정답 공개(reveal)가 문제 진행 중 방에 실리지 않는지, 제출한 답 본문이 방이 아니라
  `quizAnswers/{roomId}`로 가는지 — 한 클라이언트 안에서는 검증할 수 없는 성질이라 2인이 필요하다.
  ⚠ 가상 시계라 **호출 → 시계 진행 → await** 순서를 지켜야 한다(`run()` 헬퍼). `await 호출()`을
  먼저 하면 타이머가 안 돌아 프로미스가 영영 settle되지 않는다.

⚠ **보드 생성 전 `setRngSource(mulberry32(...))` 를 반드시 건다.** `mapAbilityToGameEffect`는
매핑 목록에 없는 특성에 rng로 효과를 하나 뽑는데(crit/lifesteal/speed/tank), 기본 난수원이
`Math.random`이라 시드를 안 잡으면 실행마다 다른 보드로 다른 게임을 재게 된다. `critChance`를
와이어에 태우기 전에는 그 추첨이 멀티 결과에 영향이 없어 드러나지 않았다. `S0 보드 결정론`이 감시.

이 하네스가 잡아 고친 결함(전부 재현 테스트가 남아 있다):
- presence 고아 되살아남 — `leaveRoom`이 방을 지운 **뒤에** presence offline을 써서 영구 고아
  (`lobby.sim.ts`가 순서를 못 박음)
- **배틀 중 끊김 = 패배 페널티 회피** — 보상 적용 창이 `roundNumber === currentRound` 하나뿐이라
  그 순간 오프라인이면 영영 미적용. 누적 원장(`rewardLedger`/`appliedReward`)으로 전환 (`S11`,`S12`)
- `normalizeTowerDetails`가 `critChance`를 떨구어 멀티에서 크리 특성이 전부 죽어 있었음 (`wireFidelity`)
- 재접속 복원이 `ability: ""`로 두어 다음 업로드에서 특성 파생값이 0이 됨 (`wireFidelity`, `S12`)

재현하지 않는 것(결론을 여기까지만 믿을 것): 트랜잭션의 로컬 낙관적 반영(applyLocally),
보안 룰, 대역폭 쿼터, 화면/입력.

## 주의: vitest 실행 시 드라이브 문자 케이스

cwd가 소문자 드라이브(`c:/...`)면 전 시뮬 파일이 "Cannot read properties of undefined
(reading 'config')"로 즉사한다. **반드시 대문자 경로에서 실행**:
`cd /c/Users/.../pokemon-td && npx vitest run --config vitest.sim.config.ts ...` (Git Bash).

## 봇 캘리브레이션 (v2.2 "처칭 엔진")

**목표 사다리** (개발자 지정, 기준 = **아는 유저의 판당 승률**):
인간 easiest 99% / easy 80% / medium 50% / hard 20% / extreme 1%.
봇은 인간 테크를 다 못 쓰므로 **봇 눈금 95/70/30/10/1**로 판정(2026-07-12 개발자 확정,
`single.sim.ts TARGET_CLEAR`). `sim:single` 리포트가 눈금 대비 Δ를 상시 출력.

**v2.2 실측 (3시드×4페르소나)**: easiest **100%** / easy **83%** / medium **33%**(p50 44) /
hard 0%(p50 8) / extreme 0% — 4/5단 달성. hard는 봇 구조 한계로 진단: 분리 2경로 =
실효 DPS 요구 ×2 ≈ medium +13웨이브 선행(log(2×0.85/0.7)/log 1.07). w5~6 사망 구간에선
지수·배율 레버가 거의 무효(1.07^5=1.4배뿐).

**아키텍처** (플레이테스트 봇 연구 표준: 오라클 상한 먼저 → 노브 하향 캘리브레이션):
- **코어 실력**: 모든 페르소나 공유 컨트롤러. `SkillKnobs`로 파라미터화,
  `knobsForSkill(skill 0~1)` 다이얼. `SIM_SKILL` env 일괄 지정(기본 1 = 오라클).
- **스타일**: holdout/reroller/worker/tera/lossStreaker — 구매 취향·노브 오버라이드만 다름.
- **튜너**: `npm run sim:tune` — simulated annealing(SIM_TUNE_ITERS/SEEDS/MAPS,
  SIM_TUNE_T0/COOLING). 행동 노브 9개 + 구매 가중치 5개(buyW*/carryQualityBar) 탐색.
  악화 스텝도 exp(Δ/T) 확률 수용 → 국소최적 탈출, best 별도 추적. 결과 `tune.md`.
- **디버그**: `SIM_PROBE_MAP=easy_loop SIM_PROBE_SEED=... npx vitest run --config
  vitest.sim.config.ts sim/single/probe.sim.ts` — 웨이브별 골드/라이프/팀/기술 로그.

**v2.2 코어 테크** (전부 개발자 문답·코드 검증 근거):
오프닝 "쓸만한 3~4마리+비축"(눈높이 470에서 하강, 실장착 기술 위력 30 미만 거부,
몸 2+면 잔액 130 은행·연속 허탕 손절 — 입장비 소진 빈곤 루프 차단) /
몸 6마리 조기 확정(웨이브 7, 분리맵은 앞당김) /
초반 바짝 배치 → safeWave 이후 내구 하위 절반 안전 띠(160px 밖) 후퇴 /
기절 이력 유닛 반응형 후퇴 / 갈래 분산(팀 커버리지 최소 경로 우선 — 분리맵 필수) /
누수 감지 긴급 모드 / 물약 규율(careFloor — 몸값 보호) /
**처칭(스왑 순환)**: 6/6 보드에서 w35까지 최약체를 팔고 리롤 → 왕귀형·전설·고위력
AOE(후반 눈높이 90/100+)로 교체 → 경험사탕 캐치업(예산 후반 800) — 플랫 100 XP
의도 메타의 재현 /
사탕 몰빵 + 품질 게이트(캐리 fb<520이면 리빌드 자금 비축, >700G 탈출 밸브) /
웨이브 중 사탕(15+) / 경험사탕 가성비 검사 / 타입 플랜(테라타입 기둥 단일타입 6각) /
테라 배치 / 알바(안정 시 스카우트→점원, 위기 시 리콜) / 지닌도구 전 품목·딜클래스
매칭 다중 장착 / 진화의돌 구매 / 기술 제안 묶음 중 최선 선택(pickBestMove) /
AOE 잠재력 구매 평가(aoePowerOf — L60까지) / AOE 기술 가중 웨이브 비례(상한 4).

**게임 구조 지식** (봇 설계 근거, 코드로 확인):
- 킬 XP는 생존·비알바 **전원에게** 10씩(보스 50) 분배. 플랫 100 XP → w33쯤 자연 만렙,
  이후 스왑+경험사탕 캐치업 순환이 개발자 의도 메타.
- 웨이브 종료 시 전원 무료 풀힐(기절 제외) → 물약은 순수히 웨이브 중 생존용.
- 픽커: 입장 20G(3후보). 최저가 ~85G. 사탕 L×25, 경험사탕 다음상위레벨×50(점프 클수록 쌈).
- 적 위협 160px / 타워 사거리 192px → 160~192px 띠 = 딜러 안전 지대.
- 구매 시 장착 기술 = 기술목록 앞 10개 중 첫 non-status(종별 결정적) → entryPowerOf로
  정확 평가 가능.

**측정으로 기각된 봇 설계** (재시도 금지 근거):
- statTotal 체급컷: 할인 왕귀(약어리/잉어킹류 — 지금은 종이, 최종은 캐리)까지 배제
  → medium 33%→0%.
- 5보드 처칭: 6호 몸값을 스왑에 잠식 → medium 33%→0%.
- 처칭 창 w42 확장: 교체 딥(신입 레벨 공백)이 막판 DPS 체크에 걸림 → p50 44→36.
- 분리맵 싸구려 다수 오프닝(예산 상한 30%): 내구 부족 기절 연쇄 → hard w9→w6 악화.
  갈래당 품질 > 머릿수.

## 알려진 한계 (v2.2)

- hard(분리 2경로) 봇 눈금 10% 미달 — 구조 진단은 위 참조. medium 스노우볼 강화가 선행 조건.
- 오프닝은 500G + 무작위 3장 풀 제약으로 시드 편차 큼(저품질 스타트 존재).
- 봇 미사용 기능: 융합, 거다이/메가는 웨이브끝 픽에 나올 때만.
- 멀티에 실제 AIPlayer(easy/medium/hard) 로직은 미참여 — 페르소나 봇으로 대체.
- 멀티 웨이브는 순차 실행(실게임은 병렬)이지만 플레이어 간 상호작용이 없어 결과 동치.
- 2인 하네스의 웨이브는 합성(시간·누수·보드만 흉내) — PvE 밸런스는 `sim:single`이 담당.

여담: probe의 "누적킬 항상 0"은 하네스 버그가 아니라 **실게임 버그**였다(타워
kills/damageDealt를 아무 데서도 증가시키지 않음) — 2026-07-12 GameManager.applyDamage에서
수정. 시뮬 프로브가 실게임 통계 버그를 찾아낸 사례.
