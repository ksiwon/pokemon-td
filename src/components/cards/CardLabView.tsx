// src/components/cards/CardLabView.tsx
// 미니 포켓 허브 — 지갑 / 팩 상점 / 도감 그리드 / (트레이너 타워 진입 — 추후).

import { useEffect, useMemo, useState } from 'react';
import styled, { keyframes } from 'styled-components';
import { useNavigate } from 'react-router-dom';
import { media } from '../../utils/responsive.utils';
import { Screen as Root, ScreenBackBtn as BackBtn, ScreenBody as Body, ScreenTitle as Title, ScreenTopBar as TopBar } from '../shared/screen';
import { Coins, Sparkles, Package, Layers, Swords, Trophy, ChevronRight, Users, CloudUpload, CloudDownload, X, ArrowLeft } from 'lucide-react';
import { pokeAPI } from '../../api/pokeapi';
import { useTranslation } from '../../i18n';
import { cardService, PACK_DEFS, seasonRewardForRank } from '../../services/CardService';
import { databaseService, CardRankingEntry } from '../../services/DatabaseService';
import { authService } from '../../services/AuthService';
import { daysUntilSeasonReset } from '../../utils/season';
import { Rankings } from '../modals/Rankings';
import { useCardState } from '../../hooks/useCardState';
import { useCardMeta } from '../../hooks/useCardMeta';
import { PullResult, PackType } from '../../types/cards';
import { CardFilterState, DEFAULT_CARD_FILTER, applyCardFilter } from '../../utils/cardCatalog';
import { getTypeColor } from '../../utils/typeEffectiveness';
import { CardView } from './CardView';
import { CardControls } from './CardControls';
import { CardDetailModal } from './CardDetailModal';
import { PackOpening } from './PackOpening';
import { DeckBuilder } from './DeckBuilder';
import { TrainerTower } from './TrainerTower';
import { RandomBattle } from './RandomBattle';
import { showToast } from '../shared/Toast';
import { C, FONT, SP, SCALE, ICON } from '../../styles/tokens';
import { win, winThin, btn, btnThin, sunken, pixelText, pixelBold, focusRing } from '../../styles/pixel';

type SubView = 'hub' | 'deck' | 'tower' | 'pvp';

const TYPE_SLUGS = [
  'normal', 'fire', 'water', 'electric', 'grass', 'ice', 'fighting', 'poison', 'ground',
  'flying', 'psychic', 'bug', 'rock', 'ghost', 'dragon', 'dark', 'steel', 'fairy',
];

export const CardLabView = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const state = useCardState();
  const [view, setView] = useState<SubView>('hub');
  const [opening, setOpening] = useState<{ type: PackType; results: PullResult[]; filterType?: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [typePick, setTypePick] = useState(false); // 타입팩 타입 선택 모달
  const [filter, setFilter] = useState<CardFilterState>(DEFAULT_CARD_FILTER);
  const [detailId, setDetailId] = useState<number | null>(null);
  const [rankInfo, setRankInfo] = useState<{ towerRank: number | null; collRank: number | null; top3: CardRankingEntry[] } | null>(null);
  const [showRankings, setShowRankings] = useState(false);
  const [notices, setNotices] = useState<string[]>([]); // 도감 마일스톤·시즌 보상 안내 배너
  const [backupBusy, setBackupBusy] = useState(false);
  const [lastBackupAt, setLastBackupAt] = useState<number | null>(() => databaseService.getLastBackupAt());

  // 추첨 리스트 준비(캐시 시 즉시)
  useEffect(() => { pokeAPI.preloadRarities().catch(() => {}); }, []);

  const ownedIds = useMemo(
    () => Object.values(state.collection),
    [state.collection],
  );

  // 미니 포켓 랭킹 동기화 + 허브 순위 위젯 로드.
  // 통산 수집 랭킹(cardRankings)을 반영한 뒤, 로그인+온라인이면 내 순위/Top3를 읽어온다.
  // (오프라인/비로그인은 내부에서 무시 → 싱글/스토리 오프라인 동작 무영향. read는 캐시 재활용.)
  // deps에 주간 최고층(season.bestFloor) 포함 — 새 주차에 이미 깬 층을 재등반해도
  //   (towerProgress 불변) 위젯의 내 타워 순위가 즉시 갱신되도록.
  const weeklyBestFloor = state.season?.bestFloor ?? 0;
  useEffect(() => {
    let alive = true;
    (async () => {
      await databaseService.updateCardRanking(ownedIds.length).catch(() => {});
      // [FIX] 타워 시즌 기록 쓰기를 **읽기 전에** 매듭짓는다. TrainerTower가 쏜 쓰기는
      //   fire-and-forget이라, 층을 깨고 허브로 돌아온 직후엔 아직 날아가는 중일 수 있다.
      //   그 상태로 getMyTowerRank를 부르면 서버에 문서가 없어 "미등록"을 읽는다
      //   (리더보드엔 이미 내 기록이 보이는데 내 순위줄만 미등록으로 남던 원인).
      //   실제로 진행 중인 쓰기가 있으면 같은 약속을 공유하므로 write가 늘지 않는다.
      if (weeklyBestFloor > 0) {
        await databaseService.updateTowerSeasonRanking(weeklyBestFloor).catch(() => {});
      }
      if (authService.isOfflineMode() || !authService.getCurrentUser()) {
        if (alive) setRankInfo(null);
        return;
      }
      try {
        const [towerRank, collRank, top3] = await Promise.all([
          databaseService.getMyTowerRank(),
          databaseService.getMyCollectionRank(),
          databaseService.getTowerRanking(3),
        ]);
        if (alive) setRankInfo({ towerRank, collRank, top3 });
      } catch {
        if (alive) setRankInfo(null);
      }
    })();
    return () => { alive = false; };
  }, [weeklyBestFloor, ownedIds.length]);

  // 도감 수집 마일스톤 수령 + 진행 자동 백업(30분 스로틀) — 보유 종 수 변화 시
  useEffect(() => {
    const earned = cardService.claimDexMilestones();
    if (earned.length > 0) {
      setNotices(n => [
        ...n,
        ...earned.map(m => t('cards.notice.dexMilestone', { n: m.threshold, c: m.coins, s: m.starShards })),
      ]);
    }
    databaseService.autoBackupSaves();
  }, [ownedIds.length]); // eslint-disable-line react-hooks/exhaustive-deps

  // 지난주 시즌 순위 셀프 보상 — 마운트 시 1회(직전 주 참가 기록이 있을 때만 read 발생)
  useEffect(() => {
    const pending = cardService.getUnclaimedSeasonWeek();
    if (!pending) return;
    if (authService.isOfflineMode() || !authService.getCurrentUser()) return;
    let alive = true;
    (async () => {
      let coins = 0, shards = 0;
      const parts: string[] = [];
      try {
        if (pending.bestFloor > 0) {
          const rank = await databaseService.getMyPastSeasonRank(pending.weekId, 'tower');
          const rw = seasonRewardForRank(rank);
          coins += rw.coins; shards += rw.starShards;
          parts.push(t('cards.notice.seasonTowerPart', { rank: rank ?? '-', n: pending.bestFloor }));
        }
        if (pending.pvpWins > 0) {
          const rank = await databaseService.getMyPastSeasonRank(pending.weekId, 'pvp');
          const rw = seasonRewardForRank(rank);
          coins += rw.coins; shards += rw.starShards;
          parts.push(t('cards.notice.seasonPvpPart', { rank: rank ?? '-', n: pending.pvpWins }));
        }
      } catch {
        // 순위 조회 네트워크/집계 실패 — 청구를 확정하지 않고 다음 마운트에 재시도(참가상 오확정 방지)
        return;
      }
      // 여기 도달 = 모든 조회가 확정값(순위 또는 미랭크). 1회 수령 확정.
      cardService.claimSeasonReward(pending.weekId, { coins, starShards: shards });
      if (alive) {
        setNotices(n => [
          ...n,
          t('cards.notice.seasonReward', { detail: parts.join(' · '), c: coins, s: shards }),
        ]);
      }
    })();
    return () => { alive = false; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── 클라우드 백업/복원 ────────────────────────────────────────
  const handleBackup = async () => {
    if (backupBusy) return;
    setBackupBusy(true);
    try {
      const ok = await databaseService.backupSaves();
      if (ok) setLastBackupAt(Date.now());
      else showToast(t('cards.backup.backupFail'));
    } finally {
      setBackupBusy(false);
    }
  };

  const handleRestore = async () => {
    if (backupBusy) return;
    setBackupBusy(true);
    try {
      const backup = await databaseService.fetchBackup();
      if (!backup) { showToast(t('cards.backup.noBackup')); return; }
      const when = new Date(backup.updatedAt).toLocaleString();
      const ok = window.confirm(t('cards.backup.restoreConfirm', {
        time: when,
        bOwned: backup.ownedCount, bFloor: backup.towerProgress,
        lOwned: ownedIds.length, lFloor: state.towerProgress,
      }));
      if (!ok) return;
      databaseService.applyBackupToLocal(backup);
      window.location.reload(); // 서비스 싱글톤 재로드
    } finally {
      setBackupBusy(false);
    }
  };

  // 보유 카드 이름·타입·레어도 (검색/필터/정렬 + CardView용)
  const { meta, rarity: rarityMap } = useCardMeta(ownedIds.map(c => c.pokemonId));

  // 필터+정렬 적용된 표시 목록 (기본: 도감번호 오름차순)
  const shownCards = useMemo(
    () => applyCardFilter(ownedIds, filter, meta, rarityMap),
    [ownedIds, filter, meta, rarityMap],
  );

  const detailEntry = detailId != null ? state.collection[detailId] : null;

  const doOpen = async (type: PackType, filterType?: string) => {
    if (busy || !cardService.canOpenPack(type)) return;
    setBusy(true);
    try {
      const results = await cardService.openPack(type, filterType);
      setOpening({ type, results, filterType });
    } catch (e) {
      console.warn('[CardLab] 개봉 실패', e);
      showToast(t('cards.alerts.openFail'));
    } finally {
      setBusy(false);
    }
  };

  const handleOpen = (type: PackType) => {
    // 타입팩은 먼저 타입 선택 → 그 타입만 5장. 나머지는 바로 개봉.
    if (type === 'type') { if (cardService.canOpenPack('type')) setTypePick(true); return; }
    doOpen(type);
  };

  const handlePickType = (ty: string) => { setTypePick(false); doOpen('type', ty); };

  if (view === 'deck') return <DeckBuilder onBack={() => setView('hub')} />;
  if (view === 'tower') return <TrainerTower onBack={() => setView('hub')} />;
  if (view === 'pvp') return <RandomBattle onBack={() => setView('hub')} />;

  return (
    <Root>
      <TopBar>
        <BackBtn onClick={() => navigate('/')}><ArrowLeft size={ICON.md} /> {t('cards.lab.backToMenu')}</BackBtn>
        <Title>{t('cards.menu.title')}</Title>
        <Wallet>
          <WChip><Coins size={ICON.md} color={C.gold} /> {state.wallet.coins.toLocaleString()}</WChip>
          <WChip><Sparkles size={ICON.md} color={C.purple} /> {state.wallet.starShards.toLocaleString()}</WChip>
        </Wallet>
      </TopBar>

      <Body>
        {/* 보상 안내 배너 — 도감 마일스톤·시즌 순위 보상 */}
        {notices.length > 0 && (
          <NoticeStack>
            {notices.map((msg, i) => (
              <Notice key={`${i}-${msg}`}>
                <span>{msg}</span>
                <NoticeClose onClick={() => setNotices(ns => ns.filter((_, j) => j !== i))}>
                  <X size={13} />
                </NoticeClose>
              </Notice>
            ))}
          </NoticeStack>
        )}

        {/* 랭킹 위젯 — 이번 주 시즌 타워 + 통산 수집 */}
        <RankWidget>
          <RankHead>
            <RankTitle><Trophy size={15} /> {t('cards.rank.title')}</RankTitle>
            <SeasonTag>{t('cards.rank.season')} · {t('cards.rank.resetIn', { n: daysUntilSeasonReset() })}</SeasonTag>
            <ViewAllBtn onClick={() => setShowRankings(true)}>
              {t('cards.rank.viewAll')} <ChevronRight size={13} />
            </ViewAllBtn>
          </RankHead>
          {rankInfo ? (
            <>
              <MyRankRow>
                <MyRankChip>
                  <Swords size={ICON.sm} color={C.purple} /> {t('cards.rank.tower')}{' '}
                  <b>{rankInfo.towerRank ? t('cards.rank.rankSuffix', { n: rankInfo.towerRank }) : t('cards.rank.unranked')}</b>
                </MyRankChip>
                <MyRankChip>
                  <Layers size={ICON.sm} color={C.cyan} /> {t('cards.rank.coll')}{' '}
                  <b>{rankInfo.collRank ? t('cards.rank.rankSuffix', { n: rankInfo.collRank }) : t('cards.rank.unranked')}</b>
                </MyRankChip>
              </MyRankRow>
              {rankInfo.top3.length > 0 && (
                <Podium>
                  {rankInfo.top3.map((e, i) => (
                    <PodItem key={e.userId}>
                      <PodMedal>{i === 0 ? '🥇' : i === 1 ? '🥈' : '🥉'}</PodMedal>
                      <PodName>{e.userName ?? '???'}</PodName>
                      <PodVal>{t('cards.rank.floor', { n: e.towerFloor ?? 0 })}</PodVal>
                    </PodItem>
                  ))}
                </Podium>
              )}
            </>
          ) : (
            <RankHint>{t('cards.rank.loginHint')}</RankHint>
          )}
        </RankWidget>

        {/* 팩 상점 */}
        <Section>
          <SecLabel><Package size={15} /> {t('cards.lab.packShop')}</SecLabel>
          <PackRow>
            {(['normal', 'type', 'premium'] as PackType[]).map(type => {
              const def = PACK_DEFS[type];
              const afford = state.wallet[def.currency] >= def.cost;
              return (
                <PackCard key={type} $disabled={!afford || busy} onClick={() => handleOpen(type)}>
                  <PackName>{t(`cards.packNames.${type}`)}</PackName>
                  <PackDesc>
                    {t(`cards.packDesc.${type}`)}
                  </PackDesc>
                  <PackCost $c={def.currency === 'coins' ? C.gold : C.purple}>
                    {def.currency === 'coins' ? <Coins size={13} /> : <Sparkles size={13} />}
                    {def.cost}
                  </PackCost>
                </PackCard>
              );
            })}
          </PackRow>
        </Section>

        {/* 모드 진입(준비중) */}
        <Section>
          <SecLabel><Swords size={15} /> {t('cards.lab.autobattle')}</SecLabel>
          <ModeRow>
            <ModeBtn onClick={() => setView('tower')}>
              <Swords size={18} /> {t('cards.lab.trainerTower')} <FloorBadge>{t('cards.lab.floor', { n: state.towerProgress + 1 })}</FloorBadge>
            </ModeBtn>
            <ModeBtn onClick={() => setView('pvp')}>
              <Users size={18} /> {t('cards.lab.randomBattle')} <FloorBadge>{t('cards.lab.pvpRecord', { w: cardService.getPvpRecord().wins, l: cardService.getPvpRecord().losses })}</FloorBadge>
            </ModeBtn>
            <ModeBtn onClick={() => setView('deck')}>
              <Layers size={18} /> {t('cards.lab.deckBuild')} <FloorBadge>{t('cards.lab.slots', { n: cardService.getDeck().length })}</FloorBadge>
            </ModeBtn>
          </ModeRow>
        </Section>

        {/* 도감 */}
        <Section>
          <SecLabel>
            <Layers size={15} /> {t('cards.lab.dex')}
            <DexCount>{t('cards.lab.collected', { n: ownedIds.length })}</DexCount>
          </SecLabel>
          {ownedIds.length === 0 ? (
            <Empty>{t('cards.lab.emptyDex')}</Empty>
          ) : (
            <>
              <CardControls
                value={filter}
                onChange={setFilter}
                resultCount={shownCards.length}
                totalCount={ownedIds.length}
              />
              {shownCards.length === 0 ? (
                <Empty>{t('cards.lab.noResults')}</Empty>
              ) : (
                <DexGrid>
                  {shownCards.map(c => (
                    <CardView
                      key={c.pokemonId}
                      pokemonId={c.pokemonId}
                      stars={c.stars}
                      copies={c.copies}
                      rarity={rarityMap[c.pokemonId]}
                      isNew={c.isNew}
                      size={108}
                      onClick={() => { cardService.clearNewFlag(c.pokemonId); setDetailId(c.pokemonId); }}
                    />
                  ))}
                </DexGrid>
              )}
            </>
          )}
        </Section>

        {/* 클라우드 백업 — 로그인 유저만. 수집/기록이 localStorage 단독이라 유실 안전망 */}
        {!authService.isOfflineMode() && !!authService.getCurrentUser() && (
          <BackupBar>
            <BackupInfo>
              <CloudUpload size={13} />
              {lastBackupAt
                ? t('cards.backup.last', { time: new Date(lastBackupAt).toLocaleString() })
                : t('cards.backup.never')}
            </BackupInfo>
            <BackupBtn onClick={handleBackup} disabled={backupBusy}>
              <CloudUpload size={13} /> {t('cards.backup.backupBtn')}
            </BackupBtn>
            <BackupBtn onClick={handleRestore} disabled={backupBusy}>
              <CloudDownload size={13} /> {t('cards.backup.restoreBtn')}
            </BackupBtn>
          </BackupBar>
        )}

        {/* 개발용 화폐 지급 — dev 서버에서만 노출 (프로덕션 빌드에서 제거됨) */}
        {import.meta.env.DEV && (
          <DevBar>
            <DevBtn onClick={() => cardService.devGrant(1000, 200)}>{t('cards.lab.devGrant')}</DevBtn>
          </DevBar>
        )}
      </Body>

      {typePick && (
        <TypePickVeil onClick={() => setTypePick(false)}>
          <TypePickBox onClick={e => e.stopPropagation()}>
            <TypePickTitle>{t('cards.pack.pickType')}</TypePickTitle>
            <TypeGrid>
              {TYPE_SLUGS.map(ty => (
                <TypeChip key={ty} $c={getTypeColor(ty)} onClick={() => handlePickType(ty)}>
                  {t(`types.${ty}`)}
                </TypeChip>
              ))}
            </TypeGrid>
          </TypePickBox>
        </TypePickVeil>
      )}

      {opening && (
        <PackOpening
          packType={opening.type}
          filterType={opening.filterType}
          results={opening.results}
          onClose={() => setOpening(null)}
        />
      )}
      {busy && <BusyVeil><Spinner /> {t('cards.lab.drawing')}</BusyVeil>}

      {detailEntry && detailId != null && (
        <CardDetailModal
          pokemonId={detailId}
          stars={detailEntry.stars}
          copies={detailEntry.copies}
          rarity={rarityMap[detailId]}
          onClose={() => setDetailId(null)}
        />
      )}

      {showRankings && <Rankings initialTab="tower" onClose={() => setShowRankings(false)} />}
    </Root>
  );
};

// ─── styled ──────────────────────────────────────────────────────────────────
// docs/DESIGN.md 의 디자인 시스템을 따른다.
//
// 걷어낸 것: 유리 카드(rgba 흰색 + 반투명 1px 테두리), 알약 배지, 점선 테두리,
//           uppercase eyebrow, hover 떠오름+그림자, backdrop-filter, 원형 스피너,
//           Tailwind 팔레트(#fbbf24 #c084fc #f8fafc …).

/** 대기 표시 — 원이 돌지 않고 네모가 깜빡인다. */
const blockBlink = keyframes`
  0%,  49%  { opacity: 1;    }
  50%, 100% { opacity: 0.25; }
`;

const TypePickVeil = styled.div`
  position: fixed; inset: 0; z-index: 3600;
  display: flex; align-items: center; justify-content: center;
  background: rgba(20, 16, 26, 0.86);
  padding: ${SP.lg};
`;
const TypePickBox = styled.div`
  ${win('purple')}
  ${pixelText}
  width: 100%; max-width: 420px;
  padding: ${SP.lg};
  color: ${C.text};
`;
const TypePickTitle = styled.h3`
  ${pixelBold}
  font-size: ${FONT.md}; margin: 0 0 ${SP.md}; text-align: center; color: ${C.text};
`;
const TypeGrid = styled.div`display: grid; grid-template-columns: repeat(3, 1fr); gap: ${SP.sm};`;

/** 타입 칩 — 타입 색은 정체성이라 면으로 칠한다(본가 타입 배지와 같은 문법). */
const TypeChip = styled.button<{ $c: string }>`
  ${p => sunken(p.$c)}
  ${pixelBold}
  padding: ${SP.sm} ${SP.xs};
  cursor: pointer;
  color: ${C.text};
  font-size: ${FONT.sm};
  transition: none;
  ${focusRing}
`;

// ─── 랭킹 위젯 ────────────────────────────────────────────────────────────────
const RankWidget = styled.section`
  ${win('gold')}
  display: flex; flex-direction: column; gap: ${SP.md};
  padding: ${SP.md};
  ${media.mobile} { padding: ${SP.sm}; gap: ${SP.sm}; }
`;
const RankHead = styled.div`
  display: flex; align-items: center; gap: ${SP.sm}; flex-wrap: wrap;
`;
const RankTitle = styled.div`
  ${pixelBold}
  display: flex; align-items: center; gap: ${SP.xs};
  font-size: ${FONT.sm}; color: ${C.gold};
`;
const SeasonTag = styled.span`
  ${winThin('plain')}
  font-size: ${FONT.sm}; color: ${C.textSub};
  padding: ${SP.xs} ${SP.sm};
`;
const ViewAllBtn = styled.button`
  ${pixelBold}
  margin-left: auto; display: flex; align-items: center; gap: 2px;
  background: none; border: none; cursor: pointer;
  color: ${C.purple};
  font-size: ${FONT.sm};
  padding: ${SP.xs};
  transition: none;
  @media (hover: hover) { &:hover { color: ${C.text}; } }
  ${focusRing}
`;
const MyRankRow = styled.div`
  display: grid; grid-template-columns: repeat(2, 1fr); gap: ${SP.sm};
`;
const MyRankChip = styled.div`
  ${sunken()}
  display: flex; align-items: center; gap: ${SP.xs};
  font-size: ${FONT.sm}; color: ${C.textSub};
  padding: ${SP.sm};
  b { color: ${C.text}; font-weight: 700; margin-left: 2px; }
`;
const Podium = styled.div`
  display: grid; grid-template-columns: repeat(3, 1fr); gap: ${SP.sm};
`;
const PodItem = styled.div`
  ${sunken()}
  display: flex; align-items: center; gap: ${SP.xs}; min-width: 0;
  padding: ${SP.xs} ${SP.sm};
`;
const PodMedal = styled.span`font-size: ${ICON.md}px; flex: 0 0 auto; line-height: 1;`;
const PodName = styled.span`
  ${pixelBold}
  font-size: ${FONT.sm}; color: ${C.text};
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0;
`;
const PodVal = styled.span`
  ${pixelBold}
  margin-left: auto; flex: 0 0 auto;
  font-size: ${FONT.sm}; color: ${C.purple};
  font-variant-numeric: tabular-nums;
`;
const RankHint = styled.div`
  font-size: ${FONT.sm}; color: ${C.textDim}; text-align: center; padding: ${SP.xs} 0;
`;

const Wallet = styled.div`display: flex; gap: ${SP.sm}; flex: 0 0 auto; ${media.mobile} { gap: ${SP.xs}; }`;
const WChip = styled.div`
  ${winThin('gold')}
  ${pixelBold}
  display: flex; align-items: center; gap: ${SP.xs};
  font-size: ${FONT.sm}; color: ${C.gold};
  padding: ${SP.xs} ${SP.sm}; white-space: nowrap;
`;

const Section = styled.section`display: flex; flex-direction: column; gap: ${SP.md};`;

/** 목록 머리글 — uppercase eyebrow 대신 골드 라벨 + 가로선. */
const SecLabel = styled.div`
  ${pixelBold}
  display: flex; align-items: center; gap: ${SP.sm};
  font-size: ${FONT.sm}; color: ${C.gold};

  &::after {
    content: '';
    flex: 1;
    height: ${SCALE}px;
    background: ${C.divider};
  }
`;
const DexCount = styled.span`
  order: 99;
  font-size: ${FONT.sm}; color: ${C.textDim};
  text-shadow: 1px 1px 0 ${C.textShadow};
  font-weight: 400;
`;

const PackRow = styled.div`
  display: grid; grid-template-columns: repeat(3, 1fr); gap: ${SP.md};
  @media (max-width: 600px) { grid-template-columns: 1fr; }
`;
const PackCard = styled.button<{ $disabled: boolean }>`
  ${btn('gold')}
  ${pixelText}
  position: relative; display: flex; flex-direction: column; align-items: center; gap: ${SP.xs};
  padding: ${SP.lg} ${SP.sm}; text-align: center;
  color: ${C.text};
  opacity: ${p => (p.$disabled ? 0.5 : 1)};
  pointer-events: ${p => (p.$disabled ? 'none' : 'auto')};
  ${focusRing}
`;
const PackName = styled.div`
  ${pixelBold}
  font-size: ${FONT.md};
`;
const PackDesc = styled.div`font-size: ${FONT.sm}; color: ${C.textSub};`;
const PackCost = styled.div<{ $c: string }>`
  ${pixelBold}
  display: flex; align-items: center; gap: ${SP.xs}; margin-top: ${SP.xs};
  font-size: ${FONT.sm}; color: ${p => p.$c};
`;

const ModeRow = styled.div`
  display: grid; grid-template-columns: repeat(2, 1fr); gap: ${SP.md};
  @media (max-width: 600px) { grid-template-columns: 1fr; }
`;
const ModeBtn = styled.button<{ $disabled?: boolean }>`
  ${btn('blue')}
  ${pixelBold}
  display: flex; align-items: center; justify-content: center; gap: ${SP.sm};
  padding: ${SP.md};
  font-size: ${FONT.sm};
  color: ${C.text};
  ${focusRing}
`;
const FloorBadge = styled.span`
  ${winThin('purple')}
  ${pixelBold}
  font-size: ${FONT.sm}; color: ${C.purple};
  padding: ${SP.xs} ${SP.sm};
`;

const DexGrid = styled.div`
  display: grid; grid-template-columns: repeat(auto-fill, minmax(108px, 1fr)); gap: ${SP.md};
`;
const Empty = styled.div`
  ${sunken()}
  padding: ${SP.xxl} ${SP.lg}; text-align: center;
  color: ${C.textDim}; font-size: ${FONT.sm};
`;

const NoticeStack = styled.div`display: flex; flex-direction: column; gap: ${SP.sm};`;
const Notice = styled.div`
  ${winThin('gold')}
  display: flex; align-items: center; justify-content: space-between; gap: ${SP.sm};
  color: ${C.gold}; font-size: ${FONT.sm};
  text-shadow: 1px 1px 0 ${C.textShadow};
  padding: ${SP.sm};
`;
const NoticeClose = styled.button`
  flex: 0 0 auto; display: flex; align-items: center; justify-content: center;
  background: none; border: none; padding: 0; cursor: pointer;
  color: ${C.textDim};
  transition: none;
  @media (hover: hover) { &:hover { color: ${C.text}; } }
  ${focusRing}
`;

const BackupBar = styled.div`
  ${sunken()}
  display: flex; align-items: center; justify-content: center; gap: ${SP.sm}; flex-wrap: wrap;
  padding: ${SP.sm};
`;
const BackupInfo = styled.div`
  display: flex; align-items: center; gap: ${SP.xs};
  font-size: ${FONT.sm}; color: ${C.textDim};
`;
const BackupBtn = styled.button`
  ${btnThin('plain')}
  ${pixelBold}
  display: flex; align-items: center; gap: ${SP.xs};
  color: ${C.text}; font-size: ${FONT.sm};
  padding: ${SP.xs} ${SP.sm};
  ${focusRing}
`;

const DevBar = styled.div`display: flex; justify-content: center;`;
const DevBtn = styled.button`
  ${btnThin('plain')}
  font-size: ${FONT.sm}; color: ${C.textDim};
  padding: ${SP.xs} ${SP.sm};
  ${focusRing}
`;

const BusyVeil = styled.div`
  ${pixelBold}
  position: fixed; inset: 0; z-index: 3500;
  display: flex; align-items: center; justify-content: center; gap: ${SP.md};
  background: rgba(20, 16, 26, 0.8);
  color: ${C.text}; font-size: ${FONT.sm};
`;
const Spinner = styled.div`
  width: 16px; height: 16px; background: ${C.blue};
  animation: ${blockBlink} 0.7s steps(1, end) infinite;
`;
