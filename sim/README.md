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

### 결정론

`src/utils/rng.ts` 의 `rng()` 가 게임로직 전체의 난수원 (기본 Math.random — 프로덕션 불변).
시뮬은 `setRngSource(mulberry32(seed))` 로 교체 + vitest fake timers(Date 포함) + HTTP 디스크
캐시 → **같은 시드는 항상 같은 결과** (single.sim.ts 의 결정론 테스트가 회귀 감시).

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
- **튜너**: `npm run sim:tune` — 노브 힐클라임(SIM_TUNE_ITERS/SEEDS/MAPS). 결과 `tune.md`.
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

여담: probe의 "누적킬 항상 0"은 하네스 버그가 아니라 **실게임 버그**였다(타워
kills/damageDealt를 아무 데서도 증가시키지 않음) — 2026-07-12 GameManager.applyDamage에서
수정. 시뮬 프로브가 실게임 통계 버그를 찾아낸 사례.
