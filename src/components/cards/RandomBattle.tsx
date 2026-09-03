// src/components/cards/RandomBattle.tsx
// 미니 포켓 랜덤 대전 — 다른 플레이어의 덱 스냅샷(Firestore cardDecks)과 비동기 오토배틀.
// 실시간 통신 없음: 매칭 시 상대 덱 문서 1개만 읽고(최대 6 read) 전투는 로컬 시뮬레이션.
// [FREE-TIER] 내 덱 발행은 세션 내 변경 시에만 1 write. 결과는 로컬 전적(localStorage)만 기록.

import { useMemo, useRef, useState, useEffect } from 'react';
import styled, { keyframes, css } from 'styled-components';
import { media } from '../../utils/responsive.utils';
import { Screen as Root, ScreenBackBtn as BackBtn, ScreenTitle as Title, ScreenTopBar as TopBar } from '../shared/screen';
import { ArrowLeft, Swords, FastForward, ChevronsRight, RefreshCw } from 'lucide-react';
import { pokeAPI } from '../../api/pokeapi';
import { useTranslation } from '../../i18n';
import { cardService, CardService } from '../../services/CardService';
import { databaseService, CardDeckDoc } from '../../services/DatabaseService';
import { authService } from '../../services/AuthService';
import { useCardState } from '../../hooks/useCardState';
import {
  cardBattleService, buildBattleCard, BattleCard, BattleResult, BattleLogEntry,
} from '../../services/CardBattleService';
import { BattleLogPanel, nextStatusMap, UnitStatusMap, UnitStatusBadge } from './BattleLogPanel';
import { C, FONT, SP, SCALE } from '../../styles/tokens';
import { win, winThin, btn, btnThin, pixelText, pixelBold, shadowLg, focusRing } from '../../styles/pixel';

type Phase = 'idle' | 'matching' | 'battle' | 'result';

// 최근 대전 상대 uid 기록(반복 매칭 방지). localStorage에 최대 3명.
const RECENT_OPPS_KEY = 'ptd-recent-opps';
const loadRecentOpps = (): string[] => {
  try { return JSON.parse(localStorage.getItem(RECENT_OPPS_KEY) ?? '[]'); } catch { return []; }
};
const pushRecentOpp = (uid: string): void => {
  try {
    const list = [uid, ...loadRecentOpps().filter(id => id !== uid)].slice(0, 3);
    localStorage.setItem(RECENT_OPPS_KEY, JSON.stringify(list));
  } catch { /* ignore */ }
};

// 매칭별 결정론 시드(FNV-1a) — 같은 상대 스냅샷과는 항상 같은 결과(재도전 리롤 방지).
const hashSeed = (s: string): number => {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
};

export const RandomBattle = ({ onBack }: { onBack: () => void }) => {
  const { t } = useTranslation();
  const state = useCardState();
  const deck = useMemo(() => cardService.getDeck(), [state.deck]);
  const record = cardService.getPvpRecord();

  const user = authService.getCurrentUser();
  const online = !!user && !authService.isOfflineMode();

  const [phase, setPhase] = useState<Phase>('idle');
  const [opponent, setOpponent] = useState<CardDeckDoc | null>(null);
  const [units, setUnits] = useState<Record<string, BattleCard>>({});
  const [playerOrder, setPlayerOrder] = useState<BattleCard[]>([]);
  const [enemyOrder, setEnemyOrder] = useState<BattleCard[]>([]);
  const [log, setLog] = useState<BattleLogEntry[]>([]);
  const [step, setStep] = useState(0);
  const [speed, setSpeed] = useState(1);
  const [result, setResult] = useState<BattleResult | null>(null);
  const [rewardCoins, setRewardCoins] = useState(0);
  const [dailyReward, setDailyReward] = useState<{ coins: number; starShards: number } | null>(null);
  const [hpMap, setHpMap] = useState<Record<string, number>>({});
  const [hit, setHit] = useState<string | null>(null);
  const [statusMap, setStatusMap] = useState<UnitStatusMap>({});
  // [FIX] 매칭 실패 안내는 alert()가 아니라 화면 내 배너로. alert은 이 화면의 다른 UI와
  //   톤이 다를 뿐 아니라, 다이얼로그를 억제하는 환경(인앱 브라우저 등)에선 아무것도 뜨지 않아
  //   "상대 찾기 버튼이 먹통"으로 보인다. 상대 풀이 빈 초기에는 거의 모든 유저가 밟는 경로다.
  const [notice, setNotice] = useState<string | null>(null);
  const timer = useRef<number | null>(null);

  const fail = (msg: string) => { setNotice(msg); setPhase('idle'); };

  const startMatch = async () => {
    if (!online) return;
    setNotice(null);
    if (deck.length === 0) { fail(t('cards.alerts.deckEmpty')); return; }
    // [FIX] 일일 판수 상한 — 무제한이면 "다시 매칭" 연타로 주간 승수 랭킹을 도배할 수 있고
    //   매 판 Firestore 쿼리 2회가 나가 무료 쿼터도 샌다. 차감은 매칭 시작 전에.
    if (!cardService.consumePvpMatch()) {
      fail(t('cards.pvp.dailyLimitReached', { n: CardService.PVP_DAILY_LIMIT }));
      return;
    }
    setPhase('matching');
    try {
      // 1) 내 덱 발행(변경 시에만 실제 write) + 상대 찾기
      //    전투력(별 합) 근접 우선 + 최근 상대 3명 제외(풀이 작으면 허용)
      const myDeck = cardService.getDeckWithStars();
      databaseService.publishCardDeck(myDeck).catch(() => {});
      const myPower = myDeck.reduce((s, d) => s + d.stars, 0);
      const opp = await databaseService.getRandomOpponentDeck(myPower, loadRecentOpps());
      if (!opp) {
        cardService.refundPvpMatch(); // 상대가 없는 건 플레이어 탓이 아니다
        fail(t('cards.pvp.noOpponent'));
        return;
      }
      pushRecentOpp(opp.userId);

      // 2) 내 팀 빌드
      const player: BattleCard[] = [];
      for (const s of myDeck) {
        const p = await pokeAPI.getPokemon(s.pokemonId).catch(() => null);
        if (!p) continue;
        player.push(buildBattleCard(p, {
          stars: s.stars, row: s.row, slot: s.slot, side: 'player', uid: `player-${s.pokemonId}`,
        }));
      }
      if (player.length === 0) { cardService.refundPvpMatch(); fail(t('cards.alerts.deckLoadFail')); return; }

      // 3) 상대 팀 빌드 — 스냅샷 값은 buildBattleCard가 별 1~5로 clamp(위조 방어)
      const enemy: BattleCard[] = [];
      for (let i = 0; i < Math.min(6, opp.deck.length); i++) {
        const s = opp.deck[i];
        if (!s || typeof s.pokemonId !== 'number') continue;
        const p = await pokeAPI.getPokemon(s.pokemonId).catch(() => null);
        if (!p) continue;
        enemy.push(buildBattleCard(p, {
          stars: s.stars,
          row: s.row === 'back' ? 'back' : 'front',
          slot: typeof s.slot === 'number' ? s.slot : i % 3,
          side: 'enemy',
          uid: `enemy-${i}`,
        }));
      }
      if (enemy.length === 0) {
        cardService.refundPvpMatch();
        fail(t('cards.pvp.opponentLoadFail')); return;
      }

      // 4) 시뮬레이션 — 시드는 매칭 쌍+스냅샷 시각으로 고정(같은 상대 재도전 리롤 방지)
      const seed = hashSeed(`${user!.uid}|${opp.userId}|${opp.updatedAt}`);
      const pSim = player.map(c => ({ ...c }));
      const eSim = enemy.map(c => ({ ...c }));
      const res = cardBattleService.simulate(pSim, eSim, seed);

      // 5) 보상·전적은 결과 확정 즉시 반영(재생 중 이탈해도 손실 없음)
      //    [경제] 소액 고정 — 미니 포켓은 파밍 콘텐츠가 아님(타워와 동일 기조).
      const coins = res.winner === 'player' ? 5 : 1;
      cardService.grantRewards({ coins });
      const weeklyWins = cardService.recordPvpResult(res.winner === 'player');
      // 주간 승수 랭킹 기록(승리 시에만 값 반환). 오프라인/비로그인은 내부에서 무시.
      if (weeklyWins !== null) {
        databaseService.updateCardPvpSeasonRanking(weeklyWins).catch(() => {});
      }
      // 일일 첫 승 보너스(타워/랜덤대전 공통)
      const daily = res.winner === 'player' ? cardService.claimDailyFirstWin() : null;

      // 6) 재생 준비 — 시너지 적용본을 풀피로 리셋
      const all: Record<string, BattleCard> = {};
      const reset = (arr: BattleCard[]) => arr.map(c => { const u = { ...c, currentHp: c.maxHp }; all[u.uid] = u; return u; });
      const pOrder = reset(pSim);
      const eOrder = reset(eSim);
      const hp0: Record<string, number> = {};
      Object.values(all).forEach(u => { hp0[u.uid] = u.maxHp; });

      setOpponent(opp);
      setUnits(all);
      setPlayerOrder(pOrder);
      setEnemyOrder(eOrder);
      setHpMap(hp0);
      setStatusMap({});
      setLog(res.log);
      setResult(res);
      setRewardCoins(coins);
      setDailyReward(daily);
      setStep(0);
      setPhase('battle');
    } catch (e) {
      cardService.refundPvpMatch(); // 전투가 성립하지 않았으므로 판수 반환
      console.warn('[RandomBattle] 매칭/전투 준비 실패', e);
      fail(t('cards.alerts.battlePrepError'));
    }
  };

  // 로그 재생 (TrainerTower와 동일 패턴)
  useEffect(() => {
    if (phase !== 'battle') return;
    if (step >= log.length) { finish(); return; }
    timer.current = window.setTimeout(() => {
      const e = log[step];
      setHpMap(m => ({ ...m, [e.targetUid]: e.remainingHp }));
      setStatusMap(m => nextStatusMap(m, e));
      // 피격 흔들림은 데미지 이벤트(attack/dot)에만 — 회복/행동불가는 제외
      if (!e.kind || e.kind === 'attack' || e.kind === 'dot') {
        setHit(e.targetUid);
        window.setTimeout(() => setHit(null), 180 / speed);
      }
      setStep(s => s + 1);
      // 전투 길이 증가에 맞춘 재생 단축(TrainerTower와 동일)
    }, 380 / speed);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [phase, step, log, speed]); // eslint-disable-line react-hooks/exhaustive-deps

  const skipToEnd = () => {
    if (!result) return;
    const finalHp: Record<string, number> = {};
    Object.values(units).forEach(u => { finalHp[u.uid] = u.maxHp; });
    log.forEach(e => { finalHp[e.targetUid] = e.remainingHp; });
    setHpMap(finalHp);
    setStatusMap({}); // 전투 종료 — 상태 표시 정리
    setStep(log.length);
    finish();
  };

  const finish = () => {
    if (!result || phase === 'result') return;
    setPhase('result');
  };

  const reset = () => {
    setPhase('idle'); setResult(null); setOpponent(null); setLog([]); setStep(0);
    setRewardCoins(0); setDailyReward(null); setStatusMap({});
  };

  // ─── 렌더 ───────────────────────────────────────────────────────
  const renderUnit = (u: BattleCard) => {
    const hp = hpMap[u.uid] ?? u.maxHp;
    const pct = Math.max(0, (hp / u.maxHp) * 100);
    const dead = hp <= 0;
    const status = statusMap[u.uid];
    return (
      <Unit key={u.uid} $dead={dead} $hit={hit === u.uid} $side={u.side}>
        {status && !dead && <UnitStatusBadge kind={status.kind} />}
        <Sprite src={u.sprite} alt={u.name} draggable={false} $side={u.side} />
        <HpBar><HpFill $pct={pct} $low={pct < 30} /></HpBar>
        <UStars>{'★'.repeat(u.stars)}</UStars>
      </Unit>
    );
  };

  const renderTeam = (order: BattleCard[], side: 'player' | 'enemy') => {
    const front = order.filter(u => u.row === 'front');
    const back = order.filter(u => u.row === 'back');
    const rows = side === 'enemy' ? [back, front] : [front, back];
    return (
      <Team $side={side}>
        {rows.map((r, i) => (
          <ArenaRow key={i}>{r.map(renderUnit)}</ArenaRow>
        ))}
      </Team>
    );
  };

  const oppName = opponent?.userName || t('cards.pvp.unknownPlayer');
  // state.daily가 바뀔 때마다 재계산(판수 차감이 즉시 반영)
  const matchesLeft = useMemo(() => cardService.getPvpMatchesLeft(), [state.daily]);
  const canMatch = online && deck.length > 0 && matchesLeft > 0;

  return (
    <Root>
      <TopBar>
        <BackBtn onClick={onBack}><ArrowLeft size={16} /> {t('cards.common.back')}</BackBtn>
        <Title>{t('cards.pvp.title')}</Title>
        <RecordChip>{t('cards.pvp.record', { w: record.wins, l: record.losses })}</RecordChip>
      </TopBar>

      {phase === 'idle' && (
        <Center>
          <BigIcon><Swords size={44} /></BigIcon>
          <Desc>
            {deck.length === 0
              ? t('cards.tower.noDeck')
              : t('cards.pvp.desc', { n: deck.length })}
          </Desc>
          {notice && <NoticeBar role="status">{notice}</NoticeBar>}
          {!online && <OfflineHint>{t('cards.pvp.loginNeeded')}</OfflineHint>}
          {online && matchesLeft === 0 && (
            <OfflineHint>{t('cards.pvp.dailyLimitReached', { n: CardService.PVP_DAILY_LIMIT })}</OfflineHint>
          )}
          <StartBtn $on={canMatch} onClick={startMatch} disabled={!canMatch}>
            <Swords size={18} /> {t('cards.pvp.find')}
          </StartBtn>
          {online && <Hint>{t('cards.pvp.dailyLeft', { n: matchesLeft, total: CardService.PVP_DAILY_LIMIT })}</Hint>}
          <Hint>{t('cards.pvp.hint')}</Hint>
        </Center>
      )}

      {phase === 'matching' && <Center><Desc>{t('cards.pvp.searching')}</Desc></Center>}

      {(phase === 'battle' || phase === 'result') && (
        <BattleWrap>
          <Arena>
            <SideLabel $side="enemy">{t('cards.pvp.opponentDeck', { name: oppName })}</SideLabel>
            {renderTeam(enemyOrder, 'enemy')}
            <Divider />
            {renderTeam(playerOrder, 'player')}
            <SideLabel $side="player">{t('cards.tower.myDeck')}</SideLabel>

            {phase === 'battle' && (
              <Controls>
                <CtrlBtn onClick={() => setSpeed(s => (s === 1 ? 2 : s === 2 ? 4 : 1))}>
                  <FastForward size={15} /> {speed}x
                </CtrlBtn>
                <CtrlBtn onClick={skipToEnd}><ChevronsRight size={15} /> {t('cards.tower.skip')}</CtrlBtn>
              </Controls>
            )}
          </Arena>
          <BattleLogPanel log={log} units={units} count={step} />
        </BattleWrap>
      )}

      {phase === 'result' && result && (
        <ResultVeil>
          <ResultCard $win={result.winner === 'player'}>
            <ResultTitle $win={result.winner === 'player'}>
              {result.winner === 'player' ? t('cards.tower.victory') : t('cards.tower.defeat')}
            </ResultTitle>
            <ResultSub>
              {t('cards.pvp.vsResult', { name: oppName, p: result.playerAlive, e: result.enemyAlive })}
            </ResultSub>
            {rewardCoins > 0 && (
              <RewardRow>
                <Rw $c={C.gold}>{t('cards.tower.coins', { n: rewardCoins })}</Rw>
              </RewardRow>
            )}
            {dailyReward && (
              <RewardRow>
                <DailyBadge>{t('cards.daily.firstWin')}</DailyBadge>
                <Rw $c={C.gold}>{t('cards.tower.coins', { n: dailyReward.coins })}</Rw>
                {dailyReward.starShards > 0 && <Rw $c={C.purple}>{t('cards.tower.shards', { n: dailyReward.starShards })}</Rw>}
              </RewardRow>
            )}
            <ResultBtns>
              {matchesLeft > 0 && (
                <PrimaryBtn onClick={() => { reset(); startMatch(); }}>
                  <RefreshCw size={14} style={{ marginRight: 6, verticalAlign: -2 }} />
                  {t('cards.pvp.rematch')}
                </PrimaryBtn>
              )}
              <GhostBtn onClick={onBack}>{t('cards.tower.exit')}</GhostBtn>
            </ResultBtns>
          </ResultCard>
        </ResultVeil>
      )}
    </Root>
  );
};

// ─── animations ──────────────────────────────────────────────────────────────
const shake = keyframes`0%,100%{transform:translateX(0)}25%{transform:translateX(-4px)}75%{transform:translateX(4px)}`;
const popIn = keyframes`from{opacity:0;transform:scale(0.85)}to{opacity:1;transform:scale(1)}`;

// ─── styled (TrainerTower와 동일 톤) ─────────────────────────────────────────
// docs/DESIGN.md 의 디자인 시스템을 따른다.

const RecordChip = styled.div`
  ${winThin('cyan')}
  ${pixelBold}
  flex: 0 0 auto;
  font-size: ${FONT.sm}; color: ${C.cyan};
  padding: ${SP.xs} ${SP.sm}; white-space: nowrap;
`;

const Center = styled.div`
  flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center;
  gap: ${SP.md}; padding: ${SP.xxl};
  ${media.mobile} { gap: ${SP.sm}; padding: ${SP.xl} ${SP.md}; }
`;
const BigIcon = styled.div`color: ${C.cyan};`;
const Desc = styled.div`font-size: ${FONT.sm}; color: ${C.textSub}; text-align: center;`;
const OfflineHint = styled.div`
  ${winThin('gold')}
  font-size: ${FONT.sm}; color: ${C.gold};
  text-shadow: 1px 1px 0 ${C.textShadow};
  padding: ${SP.xs} ${SP.sm};
`;
/* 매칭 실패 안내 배너(구 alert). 상대 없음/일일 상한/로딩 실패 공용. */
const NoticeBar = styled.div`
  ${winThin('red')}
  font-size: ${FONT.sm}; color: ${C.red};
  text-shadow: 1px 1px 0 ${C.textShadow};
  padding: ${SP.sm}; max-width: 380px; text-align: center;
`;
const StartBtn = styled.button<{ $on: boolean }>`
  ${p => btn(p.$on ? 'cyan' : 'plain')}
  ${pixelBold}
  display: flex; align-items: center; gap: ${SP.sm};
  margin-top: ${SP.sm}; padding: ${SP.sm} ${SP.xxl};
  color: ${p => (p.$on ? C.text : C.textDim)};
  font-size: ${FONT.sm};
  cursor: ${p => (p.$on ? 'pointer' : 'not-allowed')};
  ${focusRing}
`;
const Hint = styled.div`
  font-size: ${FONT.sm}; color: ${C.textDim}; text-align: center; max-width: 340px;
`;

const BattleWrap = styled.div`
  flex: 1; width: 100%; max-width: 1080px; margin: 0 auto; padding: 0 ${SP.md};
  display: flex; gap: ${SP.md}; align-items: stretch;
  ${media.tablet} { flex-direction: column; padding: 0 ${SP.sm} ${SP.md}; }
`;
const Arena = styled.div`
  flex: 1; min-width: 0; padding: ${SP.lg} 0;
  display: flex; flex-direction: column; gap: ${SP.sm}; position: relative;
  ${media.mobile} { padding: ${SP.md} 0 ${SP.xs}; }
`;
const SideLabel = styled.div<{ $side: 'player' | 'enemy' }>`
  ${pixelBold}
  font-size: ${FONT.sm};
  color: ${p => (p.$side === 'enemy' ? C.red : C.green)};
  text-align: ${p => (p.$side === 'enemy' ? 'left' : 'right')};
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
`;
const Team = styled.div<{ $side: 'player' | 'enemy' }>`display: flex; flex-direction: column; gap: ${SP.md};`;
const ArenaRow = styled.div`display: flex; justify-content: center; gap: ${SP.lg}; min-height: 78px;`;
const Unit = styled.div<{ $dead: boolean; $hit: boolean; $side: 'player' | 'enemy' }>`
  position: relative;
  display: flex; flex-direction: column; align-items: center; gap: ${SP.xs}; width: 72px;
  opacity: ${p => (p.$dead ? 0.2 : 1)};
  filter: ${p => (p.$dead ? 'grayscale(1)' : 'none')};
  ${p => p.$hit && css`animation: ${shake} 0.18s linear;`}
`;
const Sprite = styled.img<{ $side: 'player' | 'enemy' }>`
  width: 56px; height: 56px; object-fit: contain;
  transform: scaleX(${p => (p.$side === 'enemy' ? -1 : 1)});
`;
const HpBar = styled.div`
  width: 60px; height: 8px;
  background: ${C.panelSunk};
  border: 2px solid ${C.ink};
  overflow: hidden;
`;
const HpFill = styled.div<{ $pct: number; $low: boolean }>`
  height: 100%; width: ${p => p.$pct}%;
  background: ${p => (p.$low ? C.red : C.green)};
`;
const UStars = styled.div`font-size: ${FONT.sm}; color: ${C.gold}; line-height: 1; height: 12px;`;
const Divider = styled.div`height: ${SCALE}px; background: ${C.divider}; margin: ${SP.xs} 0;`;

const Controls = styled.div`display: flex; gap: ${SP.sm}; justify-content: center; margin-top: ${SP.md};`;
const CtrlBtn = styled.button`
  ${btnThin('plain')}
  ${pixelBold}
  display: flex; align-items: center; gap: ${SP.xs};
  color: ${C.text}; padding: ${SP.xs} ${SP.sm};
  font-size: ${FONT.sm};
  ${focusRing}
`;

const ResultVeil = styled.div`
  position: fixed; inset: 0; z-index: 100;
  display: flex; align-items: center; justify-content: center;
  background: rgba(20, 16, 26, 0.82);
`;
const ResultCard = styled.div<{ $win: boolean }>`
  ${p => win(p.$win ? 'green' : 'red')}
  ${pixelText}
  color: ${C.text};
  padding: ${SP.xl}; text-align: center; min-width: 300px;
  animation: ${popIn} 0.3s ease-out both;
`;
const ResultTitle = styled.div<{ $win: boolean }>`
  ${pixelBold}
  font-size: ${FONT.display}; color: ${p => (p.$win ? C.green : C.red)};
  ${shadowLg}
`;
const ResultSub = styled.div`font-size: ${FONT.sm}; color: ${C.textSub}; margin-top: ${SP.xs};`;
const RewardRow = styled.div`
  display: flex; gap: ${SP.sm}; justify-content: center; align-items: center;
  flex-wrap: wrap; margin-top: ${SP.md};
`;
const DailyBadge = styled.span`
  ${pixelBold}
  background: ${C.cyan}; color: ${C.ink};
  border: 2px solid ${C.ink};
  font-size: ${FONT.sm}; line-height: 1.4; padding: ${SP.xs} ${SP.sm};
  text-shadow: none;
`;
const Rw = styled.span<{ $c: string }>`
  ${pixelBold}
  font-size: ${FONT.sm}; color: ${p => p.$c};
`;
const ResultBtns = styled.div`display: flex; gap: ${SP.sm}; justify-content: center; margin-top: ${SP.lg};`;
const PrimaryBtn = styled.button`
  ${btn('cyan')}
  ${pixelBold}
  padding: ${SP.sm} ${SP.xl};
  color: ${C.text}; font-size: ${FONT.sm};
  ${focusRing}
`;
const GhostBtn = styled.button`
  ${btnThin('plain')}
  ${pixelBold}
  padding: ${SP.sm} ${SP.lg};
  color: ${C.textSub}; font-size: ${FONT.sm};
  ${focusRing}
`;
