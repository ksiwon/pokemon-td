// src/components/modals/HallOfFame.tsx
import { useState, useEffect } from 'react';
import styled from 'styled-components';
import {
  ModalOverlay, ModalBox, ModalCloseBtn,
  MODAL_ACCENT,
} from '../shared/modal.styles';
import { lMedia, media } from '../../utils/responsive.utils';
import { databaseService } from '../../services/DatabaseService';
import { HallOfFameEntry, LeaderboardEntry } from '../../types/multiplayer';
import { MAPS } from '../../data/maps';
import { authService } from '../../services/AuthService';
import { quotaGuard } from '../../services/QuotaGuard';
import { useTranslation } from '../../i18n';
import { Emoji } from '../shared/Emoji';

type ViewTab = 'global_clear' | 'global_wave' | 'mine';
type MapFilter = 'all' | string;

interface HallOfFameProps {
  onClose: () => void;
}

const MEDAL = ['🥇', '🥈', '🥉'];

const formatTime = (ms: number | undefined, t: (k: string, p?: Record<string, string | number>) => string) => {
  if (!ms) return '-';
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return t('hallOfFame.minuteSecond', { m, s: sec.toString().padStart(2, '0') });
};

const formatDate = (ts: number, lang: string) =>
  new Date(ts).toLocaleDateString(lang === 'ko' ? 'ko-KR' : 'en-US', {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });

export const HallOfFame = ({ onClose }: HallOfFameProps) => {
  const { t } = useTranslation();
  const [tab, setTab] = useState<ViewTab>('global_clear');
  const [mapFilter, setMapFilter] = useState<MapFilter>('all');
  const [globalClearEntries, setGlobalClearEntries] = useState<HallOfFameEntry[]>([]);
  const [globalWaveEntries, setGlobalWaveEntries] = useState<LeaderboardEntry[]>([]);
  const [myEntries, setMyEntries] = useState<HallOfFameEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(0);
  // [FREE-TIER] 무료 쿼터 소진 상태 — '기록 없음'과 구분해 안내한다.
  const [quotaBlocked, setQuotaBlocked] = useState(() => quotaGuard.isTripped());
  const PAGE_SIZE = 10;

  useEffect(() => quotaGuard.onChange(setQuotaBlocked), []);

  const user = authService.getCurrentUser();
  const selectedMapId = mapFilter === 'all' ? undefined : mapFilter;

  useEffect(() => {
    setCurrentPage(0);
    load();
  }, [tab, mapFilter]);

  const load = async () => {
    setLoading(true);
    try {
      if (tab === 'global_clear') {
        const data = await databaseService.getGlobalHallOfFame(selectedMapId, 'clearTime');
        setGlobalClearEntries(data);
      } else if (tab === 'global_wave') {
        const data = await databaseService.getGlobalHighestWave(selectedMapId);
        setGlobalWaveEntries(data);
      } else {
        const data = await databaseService.getUserHallOfFame();
        setMyEntries(data);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const currentEntries = (() => {
    if (tab === 'global_clear') return globalClearEntries;
    if (tab === 'global_wave') return globalWaveEntries;
    return myEntries;
  })();

  const totalPages = Math.ceil(currentEntries.length / PAGE_SIZE);
  const displayedEntries = currentEntries.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE);

  return (
    <ModalOverlay onClick={onClose}>
      <ModalBox $size="lg" $accent={MODAL_ACCENT.gold} onClick={e => e.stopPropagation()}>

        {/* ── 헤더 ── */}
        <HeaderSection>
          <TitleRow>
            <SectionTitle><Emoji glyph="🏆" size={16} /> {t('hallOfFame.title')}</SectionTitle>
            <ModalCloseBtn onClick={onClose}>✕</ModalCloseBtn>
          </TitleRow>

          {/* ── 탭 ── */}
          <TabRow>
            <Tab $active={tab === 'global_clear'} onClick={() => setTab('global_clear')}>
              {t('hallOfFame.tabClear')}
            </Tab>
            <Tab $active={tab === 'global_wave'} onClick={() => setTab('global_wave')}>
              {t('hallOfFame.tabWave')}
            </Tab>
            <Tab $active={tab === 'mine'} onClick={() => setTab('mine')}>
              {t('hallOfFame.tabMine')}
            </Tab>
          </TabRow>

          {/* ── 맵 필터 (내 기록 탭 제외) ── */}
          {tab !== 'mine' && (
            <MapFilterRow>
              <FilterChip $active={mapFilter === 'all'} onClick={() => setMapFilter('all')}>
                {t('hallOfFame.mapAll')}
              </FilterChip>
              {MAPS.map(m => (
                <FilterChip
                  key={m.id}
                  $active={mapFilter === m.id}
                  onClick={() => setMapFilter(m.id)}
                >
                  {t(`mapData.${m.id}.name`) !== `mapData.${m.id}.name`
                    ? t(`mapData.${m.id}.name`)
                    : m.name}
                </FilterChip>
              ))}
            </MapFilterRow>
          )}
        </HeaderSection>

        {/* ── 콘텐츠 ── */}
        <Body>
          {loading ? (
            <CenterMsg>{t('hallOfFame.loading')}</CenterMsg>
          ) : (
            <>
              {tab === 'global_clear' && (
                <GlobalClearList
                  entries={displayedEntries as HallOfFameEntry[]}
                  myUid={user?.uid}
                  startRank={currentPage * PAGE_SIZE}
                />
              )}
              {tab === 'global_wave' && (
                <GlobalWaveList
                  entries={displayedEntries as LeaderboardEntry[]}
                  myUid={user?.uid}
                  startRank={currentPage * PAGE_SIZE}
                />
              )}
              {tab === 'mine' && (
                <MyRecordList entries={displayedEntries as HallOfFameEntry[]} />
              )}

              {totalPages > 1 && (
                <PaginationRow>
                  <PageBtn onClick={() => setCurrentPage(prev => Math.max(0, prev - 1))} disabled={currentPage === 0}>
                    ◀
                  </PageBtn>
                  <PageInfo>{currentPage + 1} / {totalPages}</PageInfo>
                  <PageBtn onClick={() => setCurrentPage(prev => Math.min(totalPages - 1, prev + 1))} disabled={currentPage === totalPages - 1}>
                    ▶
                  </PageBtn>
                </PaginationRow>
              )}
            </>
          )}
        </Body>

        {/* [FREE-TIER] 쿼터 소진 안내 — '기록 없음'과 구분 */}
        {quotaBlocked && (
          <DataNotice>
            <Emoji glyph="⚠️" size={13} /> {t('hallOfFame.quotaNotice')}
          </DataNotice>
        )}

        {/* ── 데이터 보존 안내 ── */}
        <DataNotice>
          <Emoji glyph="⚠️" size={13} /> {t('hallOfFame.dataNotice')}
        </DataNotice>

      </ModalBox>
    </ModalOverlay>
  );
};

// ─── 전체 클리어 시간 랭킹 ──────────────────────────────────────────────────

const GlobalClearList = ({
  entries, myUid, startRank = 0,
}: { entries: HallOfFameEntry[]; myUid?: string; startRank?: number }) => {
  const { t, language } = useTranslation();
  if (entries.length === 0) return <EmptyMsg>{t('hallOfFame.emptyClear')}</EmptyMsg>;

  return (
    <TableWrapper>
      <Table>
        <thead>
          <tr>
            <Th>{t('hallOfFame.colRank')}</Th>
            <Th>{t('hallOfFame.colPlayer')}</Th>
            <Th className="hide-mobile">{t('hallOfFame.colMap')}</Th>
            <Th>{t('hallOfFame.colClearTime')}</Th>
            <Th className="hide-mobile hide-tablet">{t('hallOfFame.colPokemon')}</Th>
            <Th className="hide-mobile">{t('hallOfFame.colDate')}</Th>
          </tr>
        </thead>
        <tbody>
          {entries.map((e, i) => {
            const rank = startRank + i;
            return (
              <Tr key={e.id} $isMe={e.userId === myUid} $rank={rank}>
                <Td $center>{MEDAL[rank] ? <Emoji glyph={MEDAL[rank]} size={16} /> : t('hallOfFame.rankSuffix', { rank: rank + 1 })}</Td>
                <Td $bold>{e.userName}</Td>
                <Td className="hide-mobile">
                  {t(`mapData.${e.mapId}.name`) !== `mapData.${e.mapId}.name`
                    ? t(`mapData.${e.mapId}.name`)
                    : e.mapName}
                </Td>
                <Td $bold $accent>{formatTime(e.clearTime, t)}</Td>
                <PokemonCell className="hide-mobile hide-tablet">
                  {e.pokemonUsed.map((name, j) => (
                    <PokemonTag key={j}>{name}</PokemonTag>
                  ))}
                </PokemonCell>
                <Td $small className="hide-mobile">{formatDate(e.timestamp, language)}</Td>
              </Tr>
            );
          })}
        </tbody>
      </Table>
    </TableWrapper>
  );
};

// ─── 전체 최고 웨이브 랭킹 ──────────────────────────────────────────────────

const GlobalWaveList = ({
  entries, myUid, startRank = 0,
}: { entries: LeaderboardEntry[]; myUid?: string; startRank?: number }) => {
  const { t } = useTranslation();
  if (entries.length === 0) return <EmptyMsg>{t('hallOfFame.emptyWave')}</EmptyMsg>;

  return (
    <TableWrapper>
      <Table>
        <thead>
          <tr>
            <Th>{t('hallOfFame.colRank')}</Th>
            <Th>{t('hallOfFame.colPlayer')}</Th>
            <Th className="hide-mobile">{t('hallOfFame.colMap')}</Th>
            <Th>{t('hallOfFame.colHighestWave')}</Th>
            <Th className="hide-mobile">{t('hallOfFame.colTimeClear')}</Th>
            <Th className="hide-mobile">{t('hallOfFame.colRating')}</Th>
          </tr>
        </thead>
        <tbody>
          {entries.map((e, i) => {
            const rank = startRank + i;
            return (
              <Tr key={`${e.userId}_${e.mapId}`} $isMe={e.userId === myUid} $rank={rank}>
                <Td $center>{MEDAL[rank] ? <Emoji glyph={MEDAL[rank]} size={16} /> : t('hallOfFame.rankSuffix', { rank: rank + 1 })}</Td>
                <Td $bold>{e.userName}</Td>
                <Td className="hide-mobile">
                  {t(`mapData.${e.mapId}.name`) !== `mapData.${e.mapId}.name`
                    ? t(`mapData.${e.mapId}.name`)
                    : e.mapId}
                </Td>
                <WaveCell>{e.highestWave}</WaveCell>
                <Td className="hide-mobile">{formatTime(e.clearTime, t)}</Td>
                <Td className="hide-mobile">{e.rating}</Td>
              </Tr>
            );
          })}
        </tbody>
      </Table>
    </TableWrapper>
  );
};

// ─── 내 기록 ─────────────────────────────────────────────────────────────────

const MyRecordList = ({ entries }: { entries: HallOfFameEntry[] }) => {
  const { t, language } = useTranslation();
  if (entries.length === 0)
    return (
      <EmptyMsg>
        {t('hallOfFame.emptyMine').split('\n').map((line, i) => (
          <span key={i}>{line}{i === 0 && <br />}</span>
        ))}
      </EmptyMsg>
    );

  return (
    <CardGrid>
      {entries.map(e => (
        <RecordCard key={e.id}>
          <CardTop>
            <MapBadge>
              {t(`mapData.${e.mapId}.name`) !== `mapData.${e.mapId}.name`
                ? t(`mapData.${e.mapId}.name`)
                : e.mapName}
            </MapBadge>
            <WaveBadge>Wave {e.wave}</WaveBadge>
          </CardTop>
          <TimeRow><Emoji glyph="⏱️" size={12} /> {formatTime(e.clearTime, t)}</TimeRow>
          <PokemonSection>
            <SectionLabel>{t('hallOfFame.pokemonUsed')}</SectionLabel>
            <PokemonGrid>
              {e.pokemonUsed.map((name, i) => (
                <PokemonTag key={i}>{name}</PokemonTag>
              ))}
            </PokemonGrid>
          </PokemonSection>
          <DateRow>{formatDate(e.timestamp, language)}</DateRow>
        </RecordCard>
      ))}
    </CardGrid>
  );
};

// ─── Styled Components ────────────────────────────────────────────────────────



const TabRow = styled.div`
  display: flex; gap: 4px; margin-bottom: 10px;
  padding: 0 24px;

  ${media.tablet} { padding: 0 18px; }
  ${media.mobile} { margin-bottom: 8px; padding: 0 14px; }
  ${lMedia.phoneSm} { padding: 0 12px; }
`;

const Tab = styled.button<{ $active: boolean }>`
  padding: 8px 18px; font-size: 14px; font-weight: bold;
  border: none; border-radius: 10px 10px 0 0; cursor: pointer;
  transition: background 0.2s, color 0.2s;
  background: ${p => p.$active ? 'rgba(255,215,0,0.18)' : 'rgba(255,255,255,0.06)'};
  color: ${p => p.$active ? '#FFD700' : 'rgba(255,255,255,0.5)'};
  border-bottom: ${p => p.$active ? '2px solid #FFD700' : '2px solid transparent'};
  @media (hover: hover) { &:hover { background: rgba(255,215,0,0.12); color: #FFD700; } }

  /* 태블릿 세로 */
  ${media.tablet} { padding: 7px 14px; font-size: 13px; }
  /* 모바일 세로 */
  ${media.mobile} { padding: 6px 10px; font-size: 11.5px; border-radius: 8px 8px 0 0; }
  /* 가로 모드 */
  ${lMedia.phoneSm} { padding: 5px 10px; font-size: 11px; }
`;

const MapFilterRow = styled.div`
  display: flex; gap: 6px; flex-wrap: wrap; padding-bottom: 12px;
  padding: 0 24px 12px;

  ${media.tablet} { padding: 0 18px 12px; }
  ${media.mobile} { gap: 5px; padding: 0 14px 8px; }
  ${lMedia.phoneSm} { gap: 4px; padding: 0 12px 6px; }
`;

const FilterChip = styled.button<{ $active: boolean }>`
  padding: 4px 12px; font-size: 12px; border-radius: 20px; cursor: pointer;
  border: 1px solid ${p => p.$active ? '#FFD700' : 'rgba(255,255,255,0.2)'};
  background: ${p => p.$active ? 'rgba(255,215,0,0.18)' : 'rgba(255,255,255,0.05)'};
  color: ${p => p.$active ? '#FFD700' : 'rgba(255,255,255,0.6)'};
  transition: border-color 0.2s, color 0.2s;
  @media (hover: hover) { &:hover { border-color: #FFD700; color: #FFD700; } }

  ${media.mobile} { padding: 3px 9px; font-size: 11px; }
  ${lMedia.phoneSm} { padding: 3px 8px; font-size: 10.5px; }
`;

/**
 * Body:
 *  overflow-y: auto  → 세로 스크롤
 *  overflow-x: hidden → 테이블 가로 스크롤은 TableWrapper 에서 처리
 */
const Body = styled.div`
  flex: 1; overflow-y: auto; overflow-x: hidden;
  padding: 16px 24px 24px;

  ${media.tablet} { padding: 14px 18px 20px; }
  ${media.mobile} { padding: 12px 12px 16px; }
  ${lMedia.phoneSm} { padding: 10px 10px 14px; }
`;

/**
 * TableWrapper: 모바일/태블릿에서 테이블이 넘칠 때 가로 스크롤 제공
 */
const TableWrapper = styled.div`
  width: 100%;
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
`;

const CenterMsg = styled.div`
  text-align: center; color: rgba(255,255,255,0.6);
  padding: 60px 0; font-size: 1.1rem;

  ${media.mobile} { padding: 40px 0; font-size: 1rem; }
`;

const EmptyMsg = styled.div`
  text-align: center; color: rgba(255,255,255,0.5);
  padding: 60px 20px; font-size: 1rem; line-height: 1.8;

  ${media.mobile} { padding: 40px 12px; font-size: 0.9rem; }
`;

// ─── 테이블 ──────────────────────────────────────────────────────────────────

/**
 * hide-mobile / hide-tablet 클래스:
 *  - .hide-mobile  → 모바일 세로(≤480px) + 폰 가로에서 숨김
 *  - .hide-tablet  → 태블릿 세로(≤768px)에서도 숨김
 *
 * 이를 통해 좁은 화면에서 핵심 정보만 표시 (오버플로 대신 열 숨김)
 */
const Table = styled.table`
  width: 100%;
  border-collapse: collapse;
  min-width: 320px; /* 최소 너비 보장 — TableWrapper 가 스크롤 제공 */

  /* 모바일 세로 + 폰 가로 */
  ${media.mobile} {
    .hide-mobile { display: none; }
  }
  ${lMedia.phoneSm} {
    .hide-mobile { display: none; }
  }

  /* 태블릿 세로 */
  ${media.tablet} {
    .hide-tablet { display: none; }
  }
`;

const Th = styled.th`
  text-align: left; padding: 10px 12px;
  font-size: 12px; font-weight: bold;
  color: rgba(255,215,0,0.7);
  border-bottom: 1px solid rgba(255,215,0,0.15);
  white-space: nowrap;

  ${media.tablet} { padding: 9px 10px; font-size: 11px; }
  ${media.mobile} { padding: 8px 8px; font-size: 11px; }
  ${lMedia.phoneSm} { padding: 7px 8px; font-size: 10.5px; }
`;

const Tr = styled.tr<{ $isMe?: boolean; $rank?: number }>`
  border-bottom: 1px solid rgba(255,255,255,0.06);
  background: ${p =>
    p.$isMe ? 'rgba(255,215,0,0.08)' :
    p.$rank === 0 ? 'rgba(255,215,0,0.05)' :
    p.$rank === 1 ? 'rgba(192,192,192,0.05)' :
    p.$rank === 2 ? 'rgba(205,127,50,0.05)' : 'transparent'};
  transition: background 0.15s;
  @media (hover: hover) { &:hover { background: rgba(255,255,255,0.06); } }
`;

const Td = styled.td<{ $center?: boolean; $bold?: boolean; $accent?: boolean; $small?: boolean }>`
  padding: 10px 12px;
  font-size: ${p => p.$small ? '11px' : '13px'};
  color: ${p => p.$accent ? '#4fc3f7' : 'rgba(255,255,255,0.85)'};
  font-weight: ${p => p.$bold ? 'bold' : 'normal'};
  text-align: ${p => p.$center ? 'center' : 'left'};
  white-space: nowrap;

  ${media.tablet} { padding: 9px 10px; font-size: ${p => p.$small ? '10px' : '12px'}; }
  ${media.mobile} { padding: 8px 8px; font-size: ${p => p.$small ? '10px' : '11.5px'}; }
  ${lMedia.phoneSm} { padding: 7px 8px; font-size: 11px; }
`;

const PokemonCell = styled.td`
  padding: 8px 12px;
  display: flex; flex-wrap: wrap; gap: 4px; align-items: center;

  ${media.tablet} { padding: 7px 10px; gap: 3px; }
`;

const WaveCell = styled.td`
  padding: 10px 12px;
  font-size: 18px; font-weight: bold; color: #FFD700;

  ${media.tablet} { font-size: 15px; padding: 9px 10px; }
  ${media.mobile} { font-size: 14px; padding: 8px 8px; }
`;

const PokemonTag = styled.span`
  font-size: 11px; padding: 2px 8px;
  background: rgba(76,175,255,0.15);
  border: 1px solid rgba(76,175,255,0.3);
  border-radius: 10px; color: #4cafff;
  white-space: nowrap;

  ${media.mobile} { font-size: 10px; padding: 2px 6px; }
`;

// ─── 내 기록 카드 ─────────────────────────────────────────────────────────────

const CardGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 16px;

  /* 태블릿 세로 */
  ${media.tablet} {
    grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
    gap: 12px;
  }
  /* 모바일 세로 */
  ${media.mobile} {
    grid-template-columns: 1fr;
    gap: 10px;
  }
  /* 태블릿 가로 */
  ${lMedia.tablet} {
    grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
    gap: 12px;
  }
  /* 폰 가로 */
  ${lMedia.phoneSm} {
    grid-template-columns: 1fr;
    gap: 8px;
  }
`;

const RecordCard = styled.div`
  background: rgba(255,255,255,0.05);
  border: 1px solid rgba(255,215,0,0.2);
  border-radius: 14px; padding: 16px;
  transition: transform 0.2s, box-shadow 0.2s;
  @media (hover: hover) { &:hover { transform: translateY(-3px); box-shadow: 0 8px 24px rgba(255,215,0,0.15); } }

  ${media.mobile} { padding: 12px; border-radius: 10px; }
  ${lMedia.phoneSm} { padding: 10px; border-radius: 10px; }
`;

const CardTop = styled.div`
  display: flex; justify-content: space-between; align-items: center;
  margin-bottom: 10px;

  ${media.mobile} { margin-bottom: 8px; }
`;

const MapBadge = styled.div`
  font-size: 13px; font-weight: bold; color: #e8edf3;
  ${media.mobile} { font-size: 12px; }
`;

const WaveBadge = styled.div`
  font-size: 13px; font-weight: bold; color: #FFD700;
  background: rgba(255,215,0,0.12);
  padding: 2px 10px; border-radius: 12px;
  ${media.mobile} { font-size: 12px; padding: 2px 8px; }
`;

const TimeRow = styled.div`
  font-size: 15px; font-weight: bold; color: #4fc3f7;
  margin-bottom: 12px;

  ${media.mobile} { font-size: 13px; margin-bottom: 8px; }
`;

const PokemonSection = styled.div``;

const SectionLabel = styled.div`
  font-size: 11px; color: rgba(255,255,255,0.4);
  margin-bottom: 6px; text-transform: uppercase; letter-spacing: 0.5px;

  ${media.mobile} { font-size: 10px; margin-bottom: 4px; }
`;

const PokemonGrid = styled.div`
  display: flex; flex-wrap: wrap; gap: 4px;
  ${media.mobile} { gap: 3px; }
`;

const DateRow = styled.div`
  margin-top: 12px; font-size: 11px; color: rgba(255,255,255,0.3);
  text-align: right;

  ${media.mobile} { margin-top: 8px; font-size: 10px; }
`;

// ── 헤더 섹션 래퍼 ──
const TitleRow = styled.div`
  display: flex; align-items: center; justify-content: space-between;
  padding: 18px 24px 14px; gap: 12px;
  ${media.tablet} { padding: 14px 18px 12px; }
  ${media.mobile} { padding: 12px 14px 10px; }
  ${lMedia.phoneSm} { padding: 10px 12px 8px; }
`;

const SectionTitle = styled.h2`
  font-size: 20px; font-weight: 800; color: #FFD700; margin: 0;
  text-shadow: 0 0 20px rgba(255,215,0,0.35);
  display: flex; align-items: center; gap: 8px; flex: 1;
  ${media.tablet} { font-size: 18px; }
  ${media.mobile} { font-size: 16px; }
  ${lMedia.phoneSm} { font-size: 15px; }
`;

const HeaderSection = styled.div`
  border-bottom: 1px solid rgba(255,255,255,0.07);
  flex-shrink: 0;
`;

const PaginationRow = styled.div`
  display: flex; align-items: center; justify-content: center; gap: 16px;
  margin-top: 16px; margin-bottom: 8px;
`;

const PageBtn = styled.button`
  padding: 6px 14px; border-radius: 8px;
  background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1);
  color: #fff; cursor: pointer; font-size: 13px; font-weight: bold;
  transition: all 0.2s;
  display: flex; align-items: center; justify-content: center;
  &:disabled { opacity: 0.35; cursor: not-allowed; }
  &:not(:disabled):hover { background: rgba(255,255,255,0.12); border-color: rgba(255,255,255,0.2); }
  ${media.mobile} { padding: 5px 12px; font-size: 12px; }
`;

const PageInfo = styled.span`
  font-size: 13px; color: rgba(255,255,255,0.55); font-weight: 700;
  font-variant-numeric: tabular-nums;
  ${media.mobile} { font-size: 12px; }
`;

// ── 데이터 보존 안내 ──
const DataNotice = styled.div`
  flex-shrink: 0;
  padding: 8px 20px 10px;
  border-top: 1px solid rgba(255,255,255,0.06);
  font-size: 11px;
  color: rgba(255,255,255,0.28);
  text-align: center;
  line-height: 1.5;

  ${media.mobile} { font-size: 10px; padding: 6px 14px 8px; }
`;