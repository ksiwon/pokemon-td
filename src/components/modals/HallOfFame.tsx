// src/components/modals/HallOfFame.tsx
import { useState, useEffect } from 'react';
import styled from 'styled-components';
import {
  ModalOverlay, ModalBox, ModalCloseBtn, modalPadX, ModalTabBtn, ModalChipBtn,
  MODAL_ACCENT,
} from '../shared/modal.styles';
import { lMedia, media } from '../../utils/responsive.utils';
import { databaseService } from '../../services/DatabaseService';
import { HallOfFameEntry, LeaderboardEntry } from '../../types/multiplayer';
import { MAPS } from '../../data/maps';
import { authService } from '../../services/AuthService';
import { quotaGuard } from '../../services/QuotaGuard';
import { useTranslation } from '../../i18n';

import { C, FONT, SP, SCALE } from '../../styles/tokens';
import { winThin, btnThin, pixelBold, FRAME_W, shadowLg } from '../../styles/pixel';
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
// docs/DESIGN.md 의 디자인 시스템을 따른다.
// 걷어낸 것: 유리 카드, 알약 칩, uppercase eyebrow, hover 떠오름+글로우,
//           둥근 모서리, 10~11px 글자.

const TabRow = styled.div`
  ${modalPadX}
  display: flex; gap: ${SP.xs}; margin-bottom: ${SP.sm};
`;

/** 주 탭 — 무엇을 볼까(최단 클리어 / 최고 웨이브 / 내 기록). */
const Tab = styled(ModalTabBtn).attrs<{ $active?: boolean }>(p => ({
  $on: p.$active, $c: 'gold' as const,
}))``;

const MapFilterRow = styled.div`
  ${modalPadX}
  display: flex; gap: ${SP.xs}; flex-wrap: wrap;
  padding-bottom: ${SP.sm};
`;

/** 하위 필터 — 고른 탭 안에서 맵을 걸러낸다. 주 탭보다 한 단계 작다. */
const FilterChip = styled(ModalChipBtn).attrs<{ $active?: boolean }>(p => ({
  $on: p.$active, $c: 'gold' as const,
}))``;

/**
 * Body:
 *  overflow-y: auto  → 세로 스크롤
 *  overflow-x: hidden → 테이블 가로 스크롤은 TableWrapper 에서 처리
 */
const Body = styled.div`
  ${modalPadX}
  flex: 1; overflow-y: auto; overflow-x: hidden;
  padding-top: ${SP.md}; padding-bottom: ${SP.lg};

  &::-webkit-scrollbar { width: 10px; }
  &::-webkit-scrollbar-track { background: ${C.panelSunk}; border: ${SCALE}px solid ${C.ink}; }
  &::-webkit-scrollbar-thumb { background: ${C.divider}; border: ${SCALE}px solid ${C.ink}; }

  ${media.mobile}   { padding-top: ${SP.sm}; padding-bottom: ${SP.md}; }
  ${lMedia.phoneSm} { padding-top: ${SP.sm}; padding-bottom: ${SP.md}; }
`;

/** TableWrapper: 좁은 화면에서 테이블이 넘칠 때 가로 스크롤 제공 */
const TableWrapper = styled.div`
  width: 100%;
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
`;

const CenterMsg = styled.div`
  text-align: center; color: ${C.textSub};
  padding: ${SP.xxl} 0; font-size: ${FONT.sm};
`;

const EmptyMsg = styled.div`
  text-align: center; color: ${C.textDim};
  padding: ${SP.xxl} ${SP.lg}; font-size: ${FONT.sm};
`;

// ─── 테이블 ──────────────────────────────────────────────────────────────────

/**
 * hide-mobile / hide-tablet 클래스:
 *  - .hide-mobile  → 모바일 세로(≤480px) + 폰 가로에서 숨김
 *  - .hide-tablet  → 태블릿 세로(≤768px)에서도 숨김
 */
const Table = styled.table`
  width: 100%;
  border-collapse: collapse;
  min-width: 320px;

  ${media.mobile}   { .hide-mobile { display: none; } }
  ${lMedia.phoneSm} { .hide-mobile { display: none; } }
  ${media.tablet}   { .hide-tablet { display: none; } }
`;

const Th = styled.th`
  ${pixelBold}
  text-align: left; padding: ${SP.sm};
  font-size: ${FONT.sm};
  color: ${C.gold};
  background: ${C.panelSunk};
  border-bottom: ${SCALE}px solid ${C.ink};
  white-space: nowrap;

  ${media.mobile}   { padding: ${SP.xs}; }
  ${lMedia.phoneSm} { padding: ${SP.xs}; }
`;

const Tr = styled.tr<{ $isMe?: boolean; $rank?: number }>`
  border-bottom: 2px solid ${C.ink};
  background: ${p => (p.$isMe ? C.panelSunk : 'transparent')};
`;

const Td = styled.td<{ $center?: boolean; $bold?: boolean; $accent?: boolean; $small?: boolean }>`
  padding: ${SP.sm};
  font-size: ${FONT.sm};
  color: ${p => (p.$accent ? C.blue : C.text)};
  font-weight: ${p => (p.$bold ? 700 : 400)};
  text-align: ${p => (p.$center ? 'center' : 'left')};
  white-space: nowrap;

  ${media.mobile}   { padding: ${SP.xs}; }
  ${lMedia.phoneSm} { padding: ${SP.xs}; }
`;

const PokemonCell = styled.td`
  padding: ${SP.xs} ${SP.sm};
  display: flex; flex-wrap: wrap; gap: ${SP.xs}; align-items: center;
`;

const WaveCell = styled.td`
  ${pixelBold}
  padding: ${SP.sm};
  font-size: ${FONT.sm}; color: ${C.gold};
`;

const PokemonTag = styled.span`
  ${pixelBold}
  font-size: ${FONT.sm}; line-height: 1.4;
  padding: ${SP.xs} ${SP.sm};
  background: ${C.panelSunk};
  border: 2px solid ${C.ink};
  color: ${C.blue};
  white-space: nowrap;
`;

// ─── 내 기록 카드 ─────────────────────────────────────────────────────────────

const CardGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: ${SP.md};

  ${media.tablet}   { grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: ${SP.sm}; }
  ${media.mobile}   { grid-template-columns: 1fr; gap: ${SP.sm}; }
  ${lMedia.tablet}  { grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: ${SP.sm}; }
  ${lMedia.phoneSm} { grid-template-columns: 1fr; gap: ${SP.sm}; }
`;

const RecordCard = styled.div`
  ${winThin('gold')}
  padding: ${SP.md};
  ${media.mobile}   { padding: ${SP.sm}; }
  ${lMedia.phoneSm} { padding: ${SP.sm}; }
`;

const CardTop = styled.div`
  display: flex; justify-content: space-between; align-items: center;
  gap: ${SP.sm};
  margin-bottom: ${SP.sm};
`;

const MapBadge = styled.div`
  ${pixelBold}
  font-size: ${FONT.sm}; color: ${C.text};
`;

const WaveBadge = styled.div`
  ${pixelBold}
  font-size: ${FONT.sm}; color: ${C.gold};
  background: ${C.panelSunk};
  border: 2px solid ${C.ink};
  padding: ${SP.xs} ${SP.sm};
`;

const TimeRow = styled.div`
  ${pixelBold}
  font-size: ${FONT.sm}; color: ${C.blue};
  margin-bottom: ${SP.sm};
`;

const PokemonSection = styled.div``;

/** uppercase eyebrow를 걷어낸 자리 — 그냥 작은 라벨. */
const SectionLabel = styled.div`
  font-size: ${FONT.sm}; color: ${C.textDim};
  margin-bottom: ${SP.xs};
`;

const PokemonGrid = styled.div`
  display: flex; flex-wrap: wrap; gap: ${SP.xs};
`;

const DateRow = styled.div`
  margin-top: ${SP.sm}; font-size: ${FONT.sm}; color: ${C.textDim};
  text-align: right;
`;

// ── 헤더 섹션 래퍼 ──
const TitleRow = styled.div`
  ${modalPadX}
  display: flex; align-items: center; justify-content: space-between;
  gap: ${SP.md};
  padding-top: ${SP.lg}; padding-bottom: ${SP.md};
  ${media.mobile}   { padding-top: ${SP.md}; padding-bottom: ${SP.sm}; }
  ${lMedia.phoneSm} { padding-top: ${SP.md}; padding-bottom: ${SP.sm}; }
`;

const SectionTitle = styled.h2`
  ${pixelBold}
  ${shadowLg}
  font-size: ${FONT.xl}; color: ${C.gold}; margin: 0;
  display: flex; align-items: center; gap: ${SP.sm}; flex: 1; min-width: 0;
`;

/**
 * 제목 띠 — 창틀 안쪽 끝까지 사방으로 붙인다(업적·자료실과 같은 규칙).
 * 예전에는 창틀 안에 얌전히 들어앉아 있어, 창틀과 띠 사이에 창 바탕이 12px 남았다.
 */
const HeaderSection = styled.div`
  margin: -${FRAME_W}px -${FRAME_W}px ${SP.md};
  padding: 0 ${FRAME_W}px;
  background: ${C.panelSunk};
  border-bottom: ${SCALE}px solid ${C.ink};
  flex-shrink: 0;
`;

const PaginationRow = styled.div`
  display: flex; align-items: center; justify-content: center; gap: ${SP.md};
  margin-top: ${SP.md}; margin-bottom: ${SP.sm};
`;

const PageBtn = styled.button`
  ${btnThin('plain')}
  ${pixelBold}
  padding: ${SP.xs} ${SP.sm};
  color: ${C.text}; font-size: ${FONT.sm};
  display: flex; align-items: center; justify-content: center;
  &:focus, &:focus-visible { outline: none; }
`;

const PageInfo = styled.span`
  ${pixelBold}
  font-size: ${FONT.sm}; color: ${C.textSub};
  font-variant-numeric: tabular-nums;
`;

// ── 데이터 보존 안내 ──
const DataNotice = styled.div`
  flex-shrink: 0;
  padding: ${SP.sm} ${SP.md};
  border-top: ${SCALE}px solid ${C.ink};
  font-size: ${FONT.sm};
  color: ${C.textDim};
  text-align: center;
`;
