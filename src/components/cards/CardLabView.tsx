// src/components/cards/CardLabView.tsx
// 미니 포켓 허브 — 지갑 / 팩 상점 / 도감 그리드 / (트레이너 타워 진입 — 추후).

import { useEffect, useMemo, useState } from 'react';
import styled, { keyframes } from 'styled-components';
import { useNavigate } from 'react-router-dom';
import { media } from '../../utils/responsive.utils';
import { Coins, Sparkles, Package, Layers, Swords, Trophy, ChevronRight, Users } from 'lucide-react';
import { pokeAPI } from '../../api/pokeapi';
import { useTranslation } from '../../i18n';
import { cardService, PACK_DEFS } from '../../services/CardService';
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

  // 추첨 리스트 준비(캐시 시 즉시)
  useEffect(() => { pokeAPI.preloadRarities().catch(() => {}); }, []);

  const ownedIds = useMemo(
    () => Object.values(state.collection),
    [state.collection],
  );

  // 미니 포켓 랭킹 동기화 + 허브 순위 위젯 로드.
  // 통산 수집 랭킹(cardRankings)을 반영한 뒤, 로그인+온라인이면 내 순위/Top3를 읽어온다.
  // (오프라인/비로그인은 내부에서 무시 → 싱글/스토리 오프라인 동작 무영향. read는 60초 캐시 재활용.)
  useEffect(() => {
    let alive = true;
    (async () => {
      await databaseService.updateCardRanking(state.towerProgress, ownedIds.length).catch(() => {});
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
  }, [state.towerProgress, ownedIds.length]);

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
      alert(t('cards.alerts.openFail'));
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
        <BackBtn onClick={() => navigate('/')}>{t('cards.lab.backToMenu')}</BackBtn>
        <Title>{t('cards.menu.title')}</Title>
        <Wallet>
          <WChip><Coins size={15} color="#fbbf24" /> {state.wallet.coins.toLocaleString()}</WChip>
          <WChip><Sparkles size={15} color="#c084fc" /> {state.wallet.starShards.toLocaleString()}</WChip>
        </Wallet>
      </TopBar>

      <Body>
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
                  <Swords size={13} color="#c084fc" /> {t('cards.rank.tower')}{' '}
                  <b>{rankInfo.towerRank ? t('cards.rank.rankSuffix', { n: rankInfo.towerRank }) : t('cards.rank.unranked')}</b>
                </MyRankChip>
                <MyRankChip>
                  <Layers size={13} color="#38bdf8" /> {t('cards.rank.coll')}{' '}
                  <b>{rankInfo.collRank ? t('cards.rank.rankSuffix', { n: rankInfo.collRank }) : t('cards.rank.unranked')}</b>
                </MyRankChip>
              </MyRankRow>
              {rankInfo.top3.length > 0 && (
                <Podium>
                  {rankInfo.top3.map((e, i) => (
                    <PodItem key={e.userId}>
                      <PodMedal>{i === 0 ? '🥇' : i === 1 ? '🥈' : '🥉'}</PodMedal>
                      <PodName>{e.userName ?? '???'}</PodName>
                      <PodVal>{t('cards.rank.floor', { n: e.towerFloor })}</PodVal>
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
                  <PackCost $c={def.currency === 'coins' ? '#fbbf24' : '#c084fc'}>
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
          rarity={rarityMap[detailId]}
          onClose={() => setDetailId(null)}
        />
      )}

      {showRankings && <Rankings initialTab="tower" onClose={() => setShowRankings(false)} />}
    </Root>
  );
};

// ─── styled ──────────────────────────────────────────────────────────────────
const spin = keyframes`to { transform: rotate(360deg); }`;

const TypePickVeil = styled.div`
  position: fixed; inset: 0; z-index: 3600; display: flex; align-items: center; justify-content: center;
  background: rgba(4,6,12,0.7); backdrop-filter: blur(4px); padding: 20px;
`;
const TypePickBox = styled.div`
  width: 100%; max-width: 420px; background: radial-gradient(circle at top, #161d33, #0b0f1a);
  border: 1px solid rgba(255,255,255,0.1); border-radius: 16px; padding: 22px;
  box-shadow: 0 24px 60px rgba(0,0,0,0.6);
`;
const TypePickTitle = styled.h3`font-size: 15px; font-weight: 800; margin: 0 0 14px; text-align: center; color: #f1f5f9;`;
const TypeGrid = styled.div`display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px;`;
const TypeChip = styled.button<{ $c: string }>`
  padding: 10px 6px; border-radius: 10px; border: 1px solid ${p => p.$c}; cursor: pointer;
  background: ${p => p.$c}22; color: #fff; font-size: 13px; font-weight: 700;
  transition: transform 0.12s, background 0.12s;
  &:hover { background: ${p => p.$c}; transform: translateY(-2px); }
`;

// ─── 랭킹 위젯 ────────────────────────────────────────────────────────────────
const RankWidget = styled.section`
  display: flex; flex-direction: column; gap: 12px;
  padding: 16px 18px; border-radius: 14px;
  background: linear-gradient(160deg, rgba(251,191,36,0.08), rgba(192,132,252,0.05));
  border: 1px solid rgba(251,191,36,0.18);
  ${media.mobile} { padding: 13px 14px; gap: 10px; }
`;
const RankHead = styled.div`
  display: flex; align-items: center; gap: 10px; flex-wrap: wrap;
`;
const RankTitle = styled.div`
  display: flex; align-items: center; gap: 7px; font-size: 14px; font-weight: 800; color: #fbbf24;
`;
const SeasonTag = styled.span`
  font-size: 11px; font-weight: 700; color: rgba(255,255,255,0.5);
  background: rgba(255,255,255,0.06); padding: 3px 9px; border-radius: 100px;
`;
const ViewAllBtn = styled.button`
  margin-left: auto; display: flex; align-items: center; gap: 2px;
  background: transparent; border: none; color: #c084fc; cursor: pointer;
  font-size: 12px; font-weight: 700; padding: 4px 6px; border-radius: 6px;
  &:hover { background: rgba(192,132,252,0.12); }
`;
const MyRankRow = styled.div`
  display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px;
  ${media.mobile} { gap: 8px; }
`;
const MyRankChip = styled.div`
  display: flex; align-items: center; gap: 6px; font-size: 13px; font-weight: 600; color: rgba(255,255,255,0.75);
  background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.08);
  padding: 9px 12px; border-radius: 10px;
  b { color: #f8fafc; font-weight: 800; margin-left: 2px; }
  ${media.mobile} { font-size: 12px; padding: 8px 10px; }
`;
const Podium = styled.div`
  display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px;
`;
const PodItem = styled.div`
  display: flex; align-items: center; gap: 6px; min-width: 0;
  background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.06);
  padding: 7px 10px; border-radius: 9px;
  ${media.mobile} { padding: 6px 8px; gap: 4px; }
`;
const PodMedal = styled.span`font-size: 15px; flex: 0 0 auto;`;
const PodName = styled.span`
  font-size: 12px; font-weight: 700; color: #e8edf3;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0;
  ${media.mobile} { font-size: 11px; }
`;
const PodVal = styled.span`
  margin-left: auto; flex: 0 0 auto; font-size: 11px; font-weight: 800; color: #c084fc;
  font-variant-numeric: tabular-nums;
`;
const RankHint = styled.div`
  font-size: 12.5px; color: rgba(255,255,255,0.45); text-align: center; padding: 6px 0;
`;

const Root = styled.div`
  min-height: 100vh; background: radial-gradient(circle at top, #11162a, #070910);
  color: #e8edf5; display: flex; flex-direction: column;
`;
const TopBar = styled.header`
  display: flex; align-items: center; justify-content: space-between; gap: 12px;
  padding: 14px 22px; border-bottom: 1px solid rgba(255,255,255,0.07);
  background: rgba(255,255,255,0.02); position: sticky; top: 0; z-index: 20;
  backdrop-filter: blur(10px);
  ${media.tablet} { padding: 12px 16px; gap: 8px; }
  ${media.mobile} { padding: 10px 12px; gap: 6px; }
`;
const BackBtn = styled.button`
  flex: 0 0 auto;
  background: transparent; border: 1px solid rgba(255,255,255,0.12); color: rgba(255,255,255,0.7);
  padding: 7px 14px; border-radius: 8px; cursor: pointer; font-size: 14px;
  white-space: nowrap;
  &:hover { background: rgba(255,255,255,0.07); }
  ${media.mobile} { padding: 6px 10px; font-size: 12px; }
`;
const Title = styled.h1`
  font-size: 18px; font-weight: 800; margin: 0; letter-spacing: -0.01em;
  /* 좌우(뒤로/지갑)를 밀어내 넘치지 않도록 필요 시 줄임표 처리. */
  min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  ${media.tablet} { font-size: 16px; }
  ${media.mobile} { font-size: 14px; }
`;
const Wallet = styled.div`display: flex; gap: 8px; flex: 0 0 auto; ${media.mobile} { gap: 5px; }`;
const WChip = styled.div`
  display: flex; align-items: center; gap: 5px; font-size: 14px; font-weight: 700;
  background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.08);
  padding: 6px 12px; border-radius: 100px; white-space: nowrap;
  ${media.mobile} { font-size: 12px; padding: 5px 9px; gap: 4px; }
`;

const Body = styled.main`
  flex: 1; width: 100%; max-width: 960px; margin: 0 auto; padding: 24px 20px 60px;
  display: flex; flex-direction: column; gap: 28px;
  ${media.tablet} { padding: 20px 16px 48px; gap: 22px; }
  ${media.mobile} { padding: 16px 12px 40px; gap: 18px; }
`;
const Section = styled.section`display: flex; flex-direction: column; gap: 12px;`;
const SecLabel = styled.div`
  display: flex; align-items: center; gap: 8px; font-size: 13px; font-weight: 700;
  color: rgba(255,255,255,0.45); text-transform: uppercase; letter-spacing: 0.1em;
`;
const DexCount = styled.span`margin-left: auto; font-size: 12px; color: rgba(255,255,255,0.4); letter-spacing: 0;`;

const PackRow = styled.div`
  display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px;
  @media (max-width: 600px) { grid-template-columns: 1fr; }
`;
const PackCard = styled.button<{ $disabled: boolean }>`
  position: relative; display: flex; flex-direction: column; align-items: center; gap: 6px;
  padding: 22px 14px; border-radius: 14px; cursor: pointer; text-align: center;
  background: linear-gradient(160deg, rgba(255,255,255,0.06), rgba(255,255,255,0.02));
  border: 1px solid rgba(255,255,255,0.1); color: #fff; transition: all 0.18s;
  opacity: ${p => (p.$disabled ? 0.45 : 1)};
  pointer-events: ${p => (p.$disabled ? 'none' : 'auto')};
  &:hover { transform: translateY(-3px); border-color: rgba(255,255,255,0.25); box-shadow: 0 10px 28px rgba(0,0,0,0.4); }
`;
const PackName = styled.div`font-size: 16px; font-weight: 800;`;
const PackDesc = styled.div`font-size: 12px; color: rgba(255,255,255,0.5);`;
const PackCost = styled.div<{ $c: string }>`
  display: flex; align-items: center; gap: 5px; margin-top: 4px;
  font-size: 15px; font-weight: 800; color: ${p => p.$c};
`;

const ModeRow = styled.div`display: grid; grid-template-columns: repeat(2, 1fr); gap: 14px;
  @media (max-width: 600px) { grid-template-columns: 1fr; }`;
const ModeBtn = styled.button<{ $disabled?: boolean }>`
  display: flex; align-items: center; justify-content: center; gap: 8px;
  padding: 18px; border-radius: 12px; cursor: pointer; font-size: 15px; font-weight: 700;
  background: rgba(255,255,255,0.03); border: 1px dashed rgba(255,255,255,0.15); color: rgba(255,255,255,0.7);
  &:hover { background: rgba(255,255,255,0.06); }
`;
const FloorBadge = styled.span`
  font-size: 11px; font-weight: 800; background: rgba(192,132,252,0.18);
  padding: 2px 9px; border-radius: 10px; color: #d8b4fe;
`;

const DexGrid = styled.div`
  display: grid; grid-template-columns: repeat(auto-fill, minmax(108px, 1fr)); gap: 14px;
`;
const Empty = styled.div`
  padding: 40px; text-align: center; color: rgba(255,255,255,0.4); font-size: 14px;
  border: 1px dashed rgba(255,255,255,0.12); border-radius: 12px;
`;

const DevBar = styled.div`display: flex; justify-content: center; opacity: 0.4;`;
const DevBtn = styled.button`
  background: transparent; border: 1px solid rgba(255,255,255,0.15); color: rgba(255,255,255,0.5);
  font-size: 12px; padding: 6px 14px; border-radius: 8px; cursor: pointer;
  &:hover { opacity: 1; }
`;

const BusyVeil = styled.div`
  position: fixed; inset: 0; z-index: 3500; display: flex; align-items: center; justify-content: center; gap: 12px;
  background: rgba(5,6,12,0.6); color: #fff; font-size: 15px; font-weight: 600;
`;
const Spinner = styled.div`
  width: 22px; height: 22px; border: 3px solid rgba(255,255,255,0.2); border-top-color: #fff;
  border-radius: 50%; animation: ${spin} 0.8s linear infinite;
`;
