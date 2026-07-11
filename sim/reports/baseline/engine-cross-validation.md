# 전투 엔진 교차검증

두 엔진이 실서비스에 공존한다:
- **PvPBattleService**: AI vs AI 매치 + 타임아웃 보충. 시너지 버프 미적용, 위치 없음(최저HP 타겟).
- **arenaSim**: 인간 참여 매치. 시너지 적용, 6×6 그리드 이동/사거리.

**전체 승자 일치율: 78.6%** (시드 20 × 28쌍)

## 쌍별 비교

| 매치업 | PvPService 승률(앞보드) | Arena 승률(앞보드) | 승자 일치율 |
| --- | --- | --- | --- |
| nosyn6 vs water6 | 85.0% | 0.0% | 15.0% |
| nosyn6 vs gen1x6 | 100.0% | 65.0% | 65.0% |
| nosyn6 vs mid4 | 5.0% | 0.0% | 95.0% |
| nosyn6 vs expensive3 | 0.0% | 10.0% | 90.0% |
| nosyn6 vs tank6 | 0.0% | 15.0% | 85.0% |
| nosyn6 vs charizard3 | 0.0% | 0.0% | 100.0% |
| nosyn6 vs charmander3 | 0.0% | 0.0% | 100.0% |
| water6 vs gen1x6 | 10.0% | 95.0% | 15.0% |
| water6 vs mid4 | 0.0% | 0.0% | 100.0% |
| water6 vs expensive3 | 0.0% | 0.0% | 100.0% |
| water6 vs tank6 | 0.0% | 100.0% | 0.0% |
| water6 vs charizard3 | 0.0% | 0.0% | 100.0% |
| water6 vs charmander3 | 15.0% | 0.0% | 85.0% |
| gen1x6 vs mid4 | 70.0% | 60.0% | 60.0% |
| gen1x6 vs expensive3 | 0.0% | 0.0% | 100.0% |
| gen1x6 vs tank6 | 0.0% | 100.0% | 0.0% |
| gen1x6 vs charizard3 | 0.0% | 0.0% | 100.0% |
| gen1x6 vs charmander3 | 0.0% | 0.0% | 100.0% |
| mid4 vs expensive3 | 0.0% | 0.0% | 100.0% |
| mid4 vs tank6 | 0.0% | 95.0% | 5.0% |
| mid4 vs charizard3 | 0.0% | 0.0% | 100.0% |
| mid4 vs charmander3 | 0.0% | 0.0% | 100.0% |
| expensive3 vs tank6 | 85.0% | 100.0% | 85.0% |
| expensive3 vs charizard3 | 0.0% | 0.0% | 100.0% |
| expensive3 vs charmander3 | 0.0% | 0.0% | 100.0% |
| tank6 vs charizard3 | 0.0% | 0.0% | 100.0% |
| tank6 vs charmander3 | 0.0% | 0.0% | 100.0% |
| charizard3 vs charmander3 | 100.0% | 100.0% | 100.0% |

## 우세 방향이 뒤집히는 쌍 (엔진 드리프트 — 밸런스 공정성 이슈)

| 매치업 | PvPService | Arena |
| --- | --- | --- |
| nosyn6 vs water6 | 85.0% | 0.0% |
| water6 vs gen1x6 | 10.0% | 95.0% |
| water6 vs tank6 | 0.0% | 100.0% |
| gen1x6 vs tank6 | 0.0% | 100.0% |
| mid4 vs tank6 | 0.0% | 95.0% |

> 뒤집히는 쌍이 많으면: 같은 보드로 AI를 만나느냐 사람을 만나느냐에 따라
> 승패가 달라진다 = 매칭 운이 밸런스를 좌우. 해소 레버: PvPBattleService에
> getBuffedStats(시너지) 적용, 또는 AI 매치도 arenaSim으로 해석.
