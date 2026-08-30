// src/components/cards/PackOpening.tsx
// 팩 개봉 연출: 봉인 → 섬광 → 한 장씩 플립 공개(레어는 화면 플래시) → 요약 그리드.

import { useState, useCallback } from 'react';
import styled, { keyframes, css } from 'styled-components';
import { PullResult, PackType } from '../../types/cards';
import { MERGE_COPIES } from '../../services/CardService';
import { Rarity } from '../../data/evolution';
import { useTranslation } from '../../i18n';
import { CardView } from './CardView';
import { C, FONT, SP, SCALE } from '../../styles/tokens';
import { btn, btnThin, pixelText, pixelBold, shadowLg } from '../../styles/pixel';

const rarityRank = (r: Rarity): number =>
  ['Bronze', 'Silver', 'Gold', 'Diamond', 'Master', 'Legend'].indexOf(r);
const isRare = (r: Rarity) => rarityRank(r) >= rarityRank('Gold');

type Phase = 'sealed' | 'reveal' | 'summary';

const PACK_COLOR: Record<PackType, string> = {
  normal: '#60a5fa', type: '#34d399', premium: '#c084fc',
};

interface Props {
  packType: PackType;
  /** 타입팩일 때 선택한 타입 슬러그(표시용). */
  filterType?: string;
  results: PullResult[];
  onClose: () => void;
}

export const PackOpening = ({ packType, filterType, results, onClose }: Props) => {
  const { t } = useTranslation();
  const [phase, setPhase] = useState<Phase>('sealed');
  const [idx, setIdx] = useState(0);          // 현재 공개 중인 카드 인덱스
  const [flipped, setFlipped] = useState(false);
  const [flash, setFlash] = useState(false);

  const accent = PACK_COLOR[packType];

  const open = useCallback(() => {
    setFlash(true);
    setTimeout(() => setFlash(false), 450);
    setTimeout(() => { setPhase('reveal'); }, 350);
  }, []);

  const revealCurrent = useCallback(() => {
    if (flipped) return;
    setFlipped(true);
    if (isRare(results[idx]?.rarity)) {
      setFlash(true);
      setTimeout(() => setFlash(false), 380);
    }
  }, [flipped, idx, results]);

  const next = useCallback(() => {
    if (!flipped) { revealCurrent(); return; }
    if (idx >= results.length - 1) { setPhase('summary'); return; }
    setIdx(i => i + 1);
    setFlipped(false);
  }, [flipped, idx, results.length, revealCurrent]);

  const skipAll = useCallback(() => setPhase('summary'), []);

  const newCount = results.filter(r => r.isNew).length;
  const starUps = results.filter(r => r.starUp).length;
  const merging = results.filter(r => !r.isNew && !r.starUp && r.copies > 0).length;
  const refund = results.reduce((s, r) => s + r.refundCoins, 0);

  return (
    <Overlay>
      {flash && <Flash $color={accent} />}

      {phase === 'sealed' && (
        <SealedWrap onClick={open}>
          <Pack $color={accent}>
            <PackShine />
            <PackLabel>{t(`cards.packNames.${packType}`)}{filterType ? ` · ${t(`types.${filterType}`)}` : ''}</PackLabel>
            <PackSub>{t('cards.pack.cardCount', { n: results.length })}</PackSub>
          </Pack>
          <TapHint>{t('cards.pack.tapToOpen')}</TapHint>
        </SealedWrap>
      )}

      {phase === 'reveal' && (
        <RevealWrap onClick={next}>
          <Counter>{idx + 1} / {results.length}</Counter>
          <FlipStage>
            <Flipper $flipped={flipped}>
              <FaceBack $color={accent}>
                <BackDot $color={accent} />
              </FaceBack>
              <FaceFront>
                {flipped && (
                  <CardView
                    pokemonId={results[idx].pokemonId}
                    stars={results[idx].stars}
                    rarity={results[idx].rarity}
                    size={210}
                    interactive
                  />
                )}
              </FaceFront>
            </Flipper>
          </FlipStage>

          {flipped && (
            <RevealTags>
              {results[idx].isNew && <Tag $bg="#ef4444">NEW</Tag>}
              {results[idx].starUp && <Tag $bg="#f59e0b">★ UP → {results[idx].stars}</Tag>}
              {/* 별이 오르지 않은 중복 — 표시가 없으면 '아무 일도 안 일어남'으로 보여
                  합성이 고장난 줄 안다. 몇 장 더 모으면 되는지까지 알려준다. */}
              {!results[idx].isNew && !results[idx].starUp && results[idx].copies > 0 && (
                <Tag $bg="#7c3aed">
                  {t('cards.pack.mergeProgress', { n: results[idx].copies, of: MERGE_COPIES })}
                </Tag>
              )}
              {results[idx].refundCoins > 0 && <Tag $bg="#64748b">{t('cards.pack.plusCoins', { n: results[idx].refundCoins })}</Tag>}
            </RevealTags>
          )}

          <RevealHint>{flipped ? (idx >= results.length - 1 ? t('cards.pack.tapResult') : t('cards.pack.tapNext')) : t('cards.pack.tapReveal')}</RevealHint>
          <SkipBtn onClick={(e) => { e.stopPropagation(); skipAll(); }}>{t('cards.pack.skip')}</SkipBtn>
        </RevealWrap>
      )}

      {phase === 'summary' && (
        <SummaryWrap>
          <SumTitle>{t('cards.pack.resultTitle')}</SumTitle>
          <SumStats>
            {newCount > 0 && <SumStat $c="#fca5a5">{t('cards.pack.newCount', { n: newCount })}</SumStat>}
            {starUps > 0 && <SumStat $c="#fbbf24">{t('cards.pack.starUpCount', { n: starUps })}</SumStat>}
            {merging > 0 && <SumStat $c="#c4b5fd">{t('cards.pack.mergeCount', { n: merging })}</SumStat>}
            {refund > 0 && <SumStat $c="#94a3b8">{t('cards.pack.refundCount', { n: refund })}</SumStat>}
          </SumStats>
          <Grid>
            {results.map((r, i) => (
              <GridCell key={i} $delay={i * 0.08}>
                <CardView
                  pokemonId={r.pokemonId}
                  stars={r.stars}
                  rarity={r.rarity}
                  size={120}
                  isNew={r.isNew}
                  interactive
                />
              </GridCell>
            ))}
          </Grid>
          <CloseBtn $color={accent} onClick={onClose}>{t('cards.pack.confirm')}</CloseBtn>
        </SummaryWrap>
      )}
    </Overlay>
  );
};

// ─── animations ──────────────────────────────────────────────────────────────
const float = keyframes`0%,100%{transform:translateY(-6px)}50%{transform:translateY(6px)}`;
const shimmer = keyframes`0%{transform:translateX(-120%)}100%{transform:translateX(120%)}`;
const flashAnim = keyframes`0%{opacity:0}30%{opacity:0.9}100%{opacity:0}`;
const pop = keyframes`0%{opacity:0;transform:scale(0.8) translateY(10px)}100%{opacity:1;transform:scale(1) translateY(0)}`;
const tagPop = keyframes`0%{opacity:0;transform:scale(0.6)}60%{transform:scale(1.15)}100%{opacity:1;transform:scale(1)}`;

// ─── styled ──────────────────────────────────────────────────────────────────
//
// 팩 개봉 연출(섬광·광택·카드 뒤집기)은 이 모드의 핵심 콘텐츠라 그대로 둔다.
// 트레이딩 카드의 질감은 장르 관습이고, CardView와 같은 예외다(docs/DESIGN.md).
// 대신 껍데기 — 건너뛰기·닫기 버튼, 글자, 태그 — 는 디자인 토큰에 맞춘다.
const Overlay = styled.div`
  position: fixed; inset: 0; z-index: 4000;
  background: radial-gradient(circle at center, rgba(15,18,30,0.96), rgba(4,5,10,0.99));
  display: flex; align-items: center; justify-content: center;
  /* 짧은 가로모드 폰에서 카드(≈320px)가 세로로 넘칠 때 스크롤 허용. */
  overflow: auto; padding: 12px;
`;

const Flash = styled.div<{ $color: string }>`
  position: absolute; inset: 0; z-index: 10; pointer-events: none;
  background: radial-gradient(circle at center, #fff, ${p => p.$color} 60%, transparent 75%);
  animation: ${flashAnim} 0.45s ease-out forwards;
`;

const SealedWrap = styled.div`
  display: flex; flex-direction: column; align-items: center; gap: 28px; cursor: pointer;
`;

const Pack = styled.div<{ $color: string }>`
  position: relative; width: 220px; height: 320px; border-radius: 16px;
  background: linear-gradient(160deg, ${p => p.$color}, rgba(10,12,22,0.95) 70%);
  border: 2px solid ${p => p.$color};
  box-shadow: 0 0 50px ${p => p.$color}88, inset 0 0 40px rgba(0,0,0,0.4);
  display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px;
  overflow: hidden; animation: ${float} 3s ease-in-out infinite;
`;
const PackShine = styled.div`
  position: absolute; top: 0; left: 0; width: 50%; height: 100%;
  background: linear-gradient(100deg, transparent, rgba(255,255,255,0.5), transparent);
  animation: ${shimmer} 2.4s ease-in-out infinite;
`;
const PackLabel = styled.div`
  ${pixelBold}
  font-size: ${FONT.xl}; color: ${C.text}; z-index: 1;
  text-shadow: ${SCALE}px ${SCALE}px 0 ${C.ink};
`;
const PackSub = styled.div`${pixelText} font-size: ${FONT.sm}; color: ${C.textSub}; z-index: 1;`;
const TapHint = styled.div`
  ${pixelBold}
  font-size: ${FONT.sm}; color: ${C.textSub};
  animation: ${float} 2s ease-in-out infinite;
`;

const RevealWrap = styled.div`
  position: absolute; inset: 0; display: flex; flex-direction: column;
  align-items: center; justify-content: center; gap: 18px; cursor: pointer;
`;
const Counter = styled.div`${pixelBold} font-size: ${FONT.sm}; color: ${C.textSub};`;

const FlipStage = styled.div`perspective: 1200px;`;
const Flipper = styled.div<{ $flipped: boolean }>`
  position: relative; width: 210px; height: 294px;
  transform-style: preserve-3d;
  transition: transform 0.55s cubic-bezier(0.4, 0.2, 0.2, 1);
  ${p => p.$flipped && css`transform: rotateY(180deg);`}
`;
const Face = styled.div`
  position: absolute; inset: 0; backface-visibility: hidden;
  display: flex; align-items: center; justify-content: center;
`;
const FaceBack = styled(Face)<{ $color: string }>`
  border-radius: 14px; border: 2px solid ${p => p.$color};
  background: repeating-linear-gradient(45deg, rgba(255,255,255,0.04) 0 8px, transparent 8px 16px),
              linear-gradient(160deg, ${p => p.$color}33, rgba(8,10,18,0.95));
  box-shadow: 0 8px 28px rgba(0,0,0,0.5);
`;
const BackDot = styled.div<{ $color: string }>`
  width: 70px; height: 70px; border-radius: 50%;
  border: 6px solid ${p => p.$color}; position: relative;
  box-shadow: 0 0 20px ${p => p.$color}aa;
  &::after { content:''; position:absolute; inset:0; margin:auto; width:18px; height:18px; border-radius:50%; background:#fff; top:0; bottom:0; left:0; right:0; }
`;
const FaceFront = styled(Face)`transform: rotateY(180deg);`;

const RevealTags = styled.div`display: flex; gap: 8px; min-height: 24px;`;
const Tag = styled.span<{ $bg: string }>`
  ${pixelBold}
  background: ${p => p.$bg}; color: ${C.text};
  border: 2px solid ${C.ink};
  font-size: ${FONT.sm}; line-height: 1.4;
  padding: ${SP.xs} ${SP.sm};
  animation: ${tagPop} 0.35s ease-out both;
`;
const RevealHint = styled.div`${pixelText} font-size: ${FONT.sm}; color: ${C.textDim};`;
const SkipBtn = styled.button`
  ${btnThin('plain')}
  ${pixelBold}
  position: absolute; top: 20px; right: 20px;
  color: ${C.text}; font-size: ${FONT.sm};
  padding: ${SP.xs} ${SP.sm};
  &:focus, &:focus-visible { outline: none; }
`;

const SummaryWrap = styled.div`
  display: flex; flex-direction: column; align-items: center; gap: 18px;
  padding: 24px; max-width: 92vw; animation: ${pop} 0.4s ease-out both;
`;
const SumTitle = styled.h2`
  ${pixelBold}
  font-size: ${FONT.xl}; color: ${C.text}; margin: 0;
  ${shadowLg}
`;
const SumStats = styled.div`display: flex; gap: 12px; flex-wrap: wrap; justify-content: center;`;
const SumStat = styled.span<{ $c: string }>`
  ${pixelBold}
  font-size: ${FONT.sm}; color: ${p => p.$c};
`;
const Grid = styled.div`
  display: flex; gap: 12px; flex-wrap: wrap; justify-content: center; max-width: 720px;
`;
const GridCell = styled.div<{ $delay: number }>`
  animation: ${pop} 0.4s ease-out both; animation-delay: ${p => p.$delay}s;
`;
const CloseBtn = styled.button<{ $color: string }>`
  ${btn('gold')}
  ${pixelBold}
  margin-top: ${SP.sm}; padding: ${SP.sm} ${SP.xxl};
  color: ${C.text}; font-size: ${FONT.sm};
  &:focus, &:focus-visible { outline: none; }
`;
