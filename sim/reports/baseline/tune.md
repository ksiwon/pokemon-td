# 노브 SA 튜닝 결과

- 대상: easiest_straight, easy_loop × holdout, reroller × 시드 4 × 24회 (T0=12, cooling=0.87)
- 최적 score: 132.1 (easiest_straight:100% easy_loop:75%)

## 최적 노브

```json
{
  "safeWave": 8,
  "careThreshold": 0.5,
  "careTopUp": 0.6,
  "candyReserve": 80,
  "rebuildMargin": 60,
  "rebuildEntries": 10,
  "openingBar": 500,
  "openingEntries": 14,
  "albaStartWave": 99,
  "buyWBulk": 0.25,
  "buyWAoeBase": 200,
  "buyWEarly": 2.5,
  "buyWSynergy": 1.5,
  "carryQualityBar": 460
}
```

## 이력

| # | T | score | 맵별 클리어 | 수용 | best | 설정 |
| --- | --- | --- | --- | --- | --- | --- |
| 0 | 12.0 | 115.1 | easiest_straight:88% easy_loop:63% | ✅ | 🏆 | {"safeWave":5,"careThreshold":0.65,"careTopUp":0.7,"candyReserve":150,"rebuildMargin":60,"rebuildEntries":6,"openingBar":500,"openingEntries":10,"albaStartWave":12,"buyWBulk":0.5,"buyWAoeBase":120,"buyWEarly":2.5,"buyWSynergy":1.5,"carryQualityBar":520} |
| 1 | 12.0 | 116.8 | easiest_straight:88% easy_loop:63% | ✅ | 🏆 | {"safeWave":8,"careThreshold":0.65,"careTopUp":0.85,"candyReserve":150,"rebuildMargin":60,"rebuildEntries":6,"openingBar":500,"openingEntries":10,"albaStartWave":12,"buyWBulk":0.5,"buyWAoeBase":120,"buyWEarly":2.5,"buyWSynergy":1.5,"carryQualityBar":520} |
| 2 | 10.4 | 116.8 | easiest_straight:88% easy_loop:63% | ✅ |  | {"safeWave":8,"careThreshold":0.65,"careTopUp":0.85,"candyReserve":300,"rebuildMargin":60,"rebuildEntries":6,"openingBar":500,"openingEntries":10,"albaStartWave":12,"buyWBulk":0.5,"buyWAoeBase":200,"buyWEarly":2.5,"buyWSynergy":1.5,"carryQualityBar":520} |
| 3 | 9.1 | 116.8 | easiest_straight:88% easy_loop:63% | ✅ |  | {"safeWave":8,"careThreshold":0.65,"careTopUp":0.85,"candyReserve":300,"rebuildMargin":60,"rebuildEntries":6,"openingBar":500,"openingEntries":10,"albaStartWave":12,"buyWBulk":0.5,"buyWAoeBase":200,"buyWEarly":1.5,"buyWSynergy":1.5,"carryQualityBar":520} |
| 4 | 7.9 | 116.8 | easiest_straight:88% easy_loop:63% | ✅ |  | {"safeWave":8,"careThreshold":0.65,"careTopUp":0.85,"candyReserve":300,"rebuildMargin":60,"rebuildEntries":6,"openingBar":500,"openingEntries":14,"albaStartWave":12,"buyWBulk":0.5,"buyWAoeBase":200,"buyWEarly":1.5,"buyWSynergy":1.5,"carryQualityBar":520} |
| 5 | 6.9 | 117.4 | easiest_straight:88% easy_loop:63% | ✅ | 🏆 | {"safeWave":8,"careThreshold":0.5,"careTopUp":0.85,"candyReserve":300,"rebuildMargin":60,"rebuildEntries":6,"openingBar":500,"openingEntries":14,"albaStartWave":12,"buyWBulk":0.5,"buyWAoeBase":200,"buyWEarly":1.5,"buyWSynergy":2.5,"carryQualityBar":520} |
| 6 | 6.0 | 117.3 | easiest_straight:100% easy_loop:50% | ✅ |  | {"safeWave":12,"careThreshold":0.5,"careTopUp":0.85,"candyReserve":300,"rebuildMargin":60,"rebuildEntries":10,"openingBar":500,"openingEntries":14,"albaStartWave":12,"buyWBulk":0.5,"buyWAoeBase":200,"buyWEarly":1.5,"buyWSynergy":2.5,"carryQualityBar":520} |
| 7 | 5.2 | 117.3 | easiest_straight:88% easy_loop:63% | ✅ |  | {"safeWave":8,"careThreshold":0.5,"careTopUp":0.85,"candyReserve":300,"rebuildMargin":60,"rebuildEntries":10,"openingBar":500,"openingEntries":14,"albaStartWave":12,"buyWBulk":0.5,"buyWAoeBase":200,"buyWEarly":1.5,"buyWSynergy":2.5,"carryQualityBar":520} |
| 8 | 4.5 | 125.6 | easiest_straight:100% easy_loop:63% | ✅ | 🏆 | {"safeWave":8,"careThreshold":0.5,"careTopUp":0.85,"candyReserve":80,"rebuildMargin":60,"rebuildEntries":10,"openingBar":500,"openingEntries":14,"albaStartWave":12,"buyWBulk":0.25,"buyWAoeBase":200,"buyWEarly":1.5,"buyWSynergy":2.5,"carryQualityBar":520} |
| 9 | 3.9 | 119.3 | easiest_straight:100% easy_loop:50% | — |  | {"safeWave":8,"careThreshold":0.5,"careTopUp":0.85,"candyReserve":80,"rebuildMargin":60,"rebuildEntries":4,"openingBar":500,"openingEntries":14,"albaStartWave":12,"buyWBulk":0.8,"buyWAoeBase":200,"buyWEarly":1.5,"buyWSynergy":2.5,"carryQualityBar":520} |
| 10 | 3.4 | 117.3 | easiest_straight:100% easy_loop:50% | — |  | {"safeWave":8,"careThreshold":0.5,"careTopUp":0.85,"candyReserve":80,"rebuildMargin":60,"rebuildEntries":10,"openingBar":500,"openingEntries":14,"albaStartWave":10,"buyWBulk":0.25,"buyWAoeBase":200,"buyWEarly":1.5,"buyWSynergy":2.5,"carryQualityBar":520} |
| 11 | 3.0 | 125.6 | easiest_straight:100% easy_loop:63% | ✅ |  | {"safeWave":8,"careThreshold":0.5,"careTopUp":0.85,"candyReserve":80,"rebuildMargin":60,"rebuildEntries":10,"openingBar":500,"openingEntries":14,"albaStartWave":12,"buyWBulk":0.25,"buyWAoeBase":200,"buyWEarly":1.5,"buyWSynergy":1.5,"carryQualityBar":520} |
| 12 | 2.6 | 123.9 | easiest_straight:100% easy_loop:63% | ✅ |  | {"safeWave":8,"careThreshold":0.5,"careTopUp":0.85,"candyReserve":80,"rebuildMargin":60,"rebuildEntries":10,"openingBar":500,"openingEntries":14,"albaStartWave":99,"buyWBulk":0.25,"buyWAoeBase":200,"buyWEarly":1.5,"buyWSynergy":1.5,"carryQualityBar":460} |
| 13 | 2.3 | 123.9 | easiest_straight:100% easy_loop:63% | ✅ |  | {"safeWave":8,"careThreshold":0.5,"careTopUp":0.85,"candyReserve":80,"rebuildMargin":60,"rebuildEntries":10,"openingBar":500,"openingEntries":14,"albaStartWave":99,"buyWBulk":0.25,"buyWAoeBase":200,"buyWEarly":2.5,"buyWSynergy":1.5,"carryQualityBar":460} |
| 14 | 2.0 | 116.5 | easiest_straight:88% easy_loop:63% | — |  | {"safeWave":8,"careThreshold":0.5,"careTopUp":0.85,"candyReserve":300,"rebuildMargin":60,"rebuildEntries":10,"openingBar":500,"openingEntries":14,"albaStartWave":16,"buyWBulk":0.25,"buyWAoeBase":200,"buyWEarly":2.5,"buyWSynergy":1.5,"carryQualityBar":460} |
| 15 | 1.7 | 132.1 | easiest_straight:100% easy_loop:75% | ✅ | 🏆 | {"safeWave":8,"careThreshold":0.5,"careTopUp":0.6,"candyReserve":80,"rebuildMargin":60,"rebuildEntries":10,"openingBar":500,"openingEntries":14,"albaStartWave":99,"buyWBulk":0.25,"buyWAoeBase":200,"buyWEarly":2.5,"buyWSynergy":1.5,"carryQualityBar":460} |
| 16 | 1.5 | 125.6 | easiest_straight:100% easy_loop:63% | — |  | {"safeWave":8,"careThreshold":0.5,"careTopUp":0.6,"candyReserve":80,"rebuildMargin":60,"rebuildEntries":10,"openingBar":500,"openingEntries":14,"albaStartWave":12,"buyWBulk":0.8,"buyWAoeBase":200,"buyWEarly":2.5,"buyWSynergy":1.5,"carryQualityBar":460} |
| 17 | 1.3 | 132.1 | easiest_straight:100% easy_loop:75% | ✅ |  | {"safeWave":8,"careThreshold":0.5,"careTopUp":0.6,"candyReserve":80,"rebuildMargin":60,"rebuildEntries":10,"openingBar":500,"openingEntries":14,"albaStartWave":99,"buyWBulk":0.25,"buyWAoeBase":200,"buyWEarly":2.5,"buyWSynergy":1.5,"carryQualityBar":580} |
| 18 | 1.1 | 132.1 | easiest_straight:100% easy_loop:75% | ✅ |  | {"safeWave":8,"careThreshold":0.5,"careTopUp":0.6,"candyReserve":80,"rebuildMargin":60,"rebuildEntries":10,"openingBar":500,"openingEntries":14,"albaStartWave":99,"buyWBulk":0.8,"buyWAoeBase":200,"buyWEarly":2.5,"buyWSynergy":1.5,"carryQualityBar":580} |
| 19 | 1.0 | 132.1 | easiest_straight:100% easy_loop:75% | ✅ |  | {"safeWave":8,"careThreshold":0.5,"careTopUp":0.6,"candyReserve":80,"rebuildMargin":60,"rebuildEntries":10,"openingBar":500,"openingEntries":8,"albaStartWave":99,"buyWBulk":0.8,"buyWAoeBase":200,"buyWEarly":2.5,"buyWSynergy":1.5,"carryQualityBar":580} |
| 20 | 0.9 | 132.1 | easiest_straight:100% easy_loop:75% | ✅ |  | {"safeWave":8,"careThreshold":0.5,"careTopUp":0.6,"candyReserve":80,"rebuildMargin":60,"rebuildEntries":10,"openingBar":500,"openingEntries":10,"albaStartWave":99,"buyWBulk":0.8,"buyWAoeBase":60,"buyWEarly":2.5,"buyWSynergy":1.5,"carryQualityBar":580} |
| 21 | 0.7 | 132.1 | easiest_straight:100% easy_loop:75% | ✅ |  | {"safeWave":8,"careThreshold":0.5,"careTopUp":0.6,"candyReserve":80,"rebuildMargin":60,"rebuildEntries":10,"openingBar":500,"openingEntries":10,"albaStartWave":99,"buyWBulk":0.8,"buyWAoeBase":120,"buyWEarly":2.5,"buyWSynergy":1.5,"carryQualityBar":580} |
| 22 | 0.6 | 114.2 | easiest_straight:100% easy_loop:50% | — |  | {"safeWave":8,"careThreshold":0.5,"careTopUp":0.6,"candyReserve":80,"rebuildMargin":60,"rebuildEntries":10,"openingBar":560,"openingEntries":10,"albaStartWave":99,"buyWBulk":0.8,"buyWAoeBase":120,"buyWEarly":2.5,"buyWSynergy":1.5,"carryQualityBar":580} |
| 23 | 0.6 | 132.1 | easiest_straight:100% easy_loop:75% | ✅ |  | {"safeWave":8,"careThreshold":0.5,"careTopUp":0.6,"candyReserve":80,"rebuildMargin":60,"rebuildEntries":10,"openingBar":500,"openingEntries":8,"albaStartWave":99,"buyWBulk":0.8,"buyWAoeBase":120,"buyWEarly":2.5,"buyWSynergy":1.5,"carryQualityBar":580} |
| 24 | 0.5 | 132.1 | easiest_straight:100% easy_loop:75% | ✅ |  | {"safeWave":8,"careThreshold":0.5,"careTopUp":0.6,"candyReserve":80,"rebuildMargin":60,"rebuildEntries":10,"openingBar":500,"openingEntries":8,"albaStartWave":99,"buyWBulk":0.8,"buyWAoeBase":120,"buyWEarly":4,"buyWSynergy":1.5,"carryQualityBar":580} |
