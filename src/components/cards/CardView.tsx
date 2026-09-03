// src/components/cards/CardView.tsx
// 수집 카드 1장의 비주얼. 레어도 프레임 + 포인터 추종 홀로그래픽 광택.
// 도감/리빌/덱빌더에서 공용으로 재사용.

import { useEffect, useRef, useState } from 'react';
import styled, { css, keyframes } from 'styled-components';
import { pokeAPI } from '../../api/pokeapi';
import { Rarity, RARITY_COLORS } from '../../data/evolution';
import { getTypeColor } from '../../utils/typeEffectiveness';
import { MAX_STARS } from '../../services/CardService';
import { C, FONT, SP, ICON } from '../../styles/tokens';
import { pixelBold } from '../../styles/pixel';

const ARTWORK = (id: number) =>
  `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/${id}.png`;

/** Gold 이상만 강한 홀로 효과. */
const isHolo = (r: Rarity) => ['Gold', 'Diamond', 'Master', 'Legend'].includes(r);

interface Props {
  pokemonId: number;
  stars?: number;
  /** 다음 별까지 모아둔 잉여 중복 수. 별 뒤에 점으로 표시(0이면 숨김). */
  copies?: number;
  /** 모르면 내부에서 조회. */
  rarity?: Rarity;
  size?: number;          // 카드 폭(px). 높이는 1.4배.
  isNew?: boolean;
  /** 포인터 추종 3D/광택 활성. 기본 true. */
  interactive?: boolean;
  /** 미보유(도감 미수집) — 실루엣 처리. */
  locked?: boolean;
  onClick?: () => void;
  className?: string;
}

export const CardView = ({
  pokemonId, stars = 1, copies = 0, rarity: rarityProp, size = 150,
  isNew = false, interactive = true, locked = false, onClick, className,
}: Props) => {
  const [name, setName] = useState('');
  const [types, setTypes] = useState<string[]>([]);
  const [rarity, setRarity] = useState<Rarity>(rarityProp ?? 'Bronze');
  const [artErr, setArtErr] = useState(false);
  const [fallbackSprite, setFallbackSprite] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let alive = true;
    pokeAPI.getPokemon(pokemonId).then(p => {
      if (!alive) return;
      setName(p.displayName);
      setTypes(p.types);
      setFallbackSprite(p.sprite);
    }).catch(() => {});
    if (!rarityProp) {
      pokeAPI.getCardRarity(pokemonId).then(r => { if (alive) setRarity(r); }).catch(() => {});
    }
    return () => { alive = false; };
  }, [pokemonId, rarityProp]);

  const onPointerMove = (e: React.PointerEvent) => {
    if (!interactive || !ref.current) return;
    const el = ref.current;
    const rect = el.getBoundingClientRect();
    const px = (e.clientX - rect.left) / rect.width;   // 0..1
    const py = (e.clientY - rect.top) / rect.height;   // 0..1
    el.style.setProperty('--mx', `${px * 100}%`);
    el.style.setProperty('--my', `${py * 100}%`);
    el.style.setProperty('--rx', `${(0.5 - py) * 16}deg`);
    el.style.setProperty('--ry', `${(px - 0.5) * 16}deg`);
    el.style.setProperty('--op', '1');
  };
  const onPointerLeave = () => {
    const el = ref.current;
    if (!el) return;
    el.style.setProperty('--rx', '0deg');
    el.style.setProperty('--ry', '0deg');
    el.style.setProperty('--op', '0');
  };

  const color = RARITY_COLORS[rarity];
  const artUrl = !artErr ? ARTWORK(pokemonId) : fallbackSprite;

  return (
    <Card
      ref={ref}
      className={className}
      $size={size}
      $color={color}
      $holo={isHolo(rarity)}
      $interactive={interactive && !locked}
      $locked={locked}
      onPointerMove={onPointerMove}
      onPointerLeave={onPointerLeave}
      onClick={onClick}
    >
      <Inner $locked={locked}>
        <ArtWrap>
          {artUrl && (
            <Art src={artUrl} alt={name} draggable={false}
                 $locked={locked}
                 onError={() => setArtErr(true)} />
          )}
        </ArtWrap>
        {!locked && (
          <>
            <NameBar>
              <PName>{name || '...'}</PName>
            </NameBar>
            <TypePips>
              {types.map(t => <Pip key={t} $c={getTypeColor(t)} />)}
            </TypePips>
            <Stars>
              {Array.from({ length: stars }).map((_, i) => <Star key={i}>★</Star>)}
              {/* 다음 별까지 쌓인 중복. 도감에서 '모이는 중'이 보여야 합성이 멈춘 줄 알지 않는다. */}
              {copies > 0 && stars < MAX_STARS &&
                Array.from({ length: copies }).map((_, i) => <MergeDot key={`m${i}`} />)}
            </Stars>
          </>
        )}
        {locked && <LockMark>?</LockMark>}
      </Inner>

      {/* 광택 레이어 */}
      {!locked && <Glare />}
      {!locked && isHolo(rarity) && <Holo />}
      {isNew && <NewBadge>NEW</NewBadge>}
    </Card>
  );
};

// ─── styled ──────────────────────────────────────────────────────────────────
//
// 여기는 의도적으로 도트 문법을 따르지 않는다. 미니 포켓은 '트레이딩 카드'가
// 소재이고, 기울기·광택·홀로그램은 실제 카드의 질감이라 장르 관습이다(포켓몬
// TCG Pocket도 같은 연출을 쓴다). 그래서 3D/홀로 레이어는 그대로 두고,
// 글자와 색만 디자인 토큰에 맞춘다. docs/DESIGN.md 의 예외.
const holoShift = keyframes`
  0%   { background-position: 0% 50%; }
  100% { background-position: 200% 50%; }
`;

const Card = styled.div<{
  $size: number; $color: string; $holo: boolean; $interactive: boolean; $locked: boolean;
}>`
  --mx: 50%; --my: 50%; --rx: 0deg; --ry: 0deg; --op: 0;
  position: relative;
  width: ${p => p.$size}px;
  height: ${p => p.$size * 1.4}px;
  border-radius: ${p => Math.max(8, p.$size * 0.07)}px;
  border: 2px solid ${p => p.$color};
  background:
    linear-gradient(160deg, ${p => p.$color}22, rgba(10,12,20,0.9) 55%);
  box-shadow:
    0 6px 18px rgba(0,0,0,0.45),
    0 0 ${p => (p.$holo ? 18 : 6)}px ${p => p.$color}${p => (p.$holo ? '66' : '22')};
  transform: perspective(700px) rotateX(var(--rx)) rotateY(var(--ry));
  transform-style: preserve-3d;
  transition: transform 0.15s ease, box-shadow 0.2s ease;
  cursor: ${p => (p.$interactive || p.$locked ? 'pointer' : 'default')};
  overflow: hidden;
  user-select: none;
  ${p => p.$locked && css`filter: brightness(0.5) saturate(0); border-color: rgba(255,255,255,0.15);`}

  &:hover { ${p => p.$interactive && css`box-shadow: 0 14px 36px rgba(0,0,0,0.55), 0 0 26px ${p.$color}88;`} }
`;

const Inner = styled.div<{ $locked: boolean }>`
  position: absolute; inset: 0;
  display: flex; flex-direction: column; align-items: center;
  padding: 8px 6px;
`;

const ArtWrap = styled.div`
  flex: 1; width: 100%;
  display: flex; align-items: center; justify-content: center;
  min-height: 0;
`;

const Art = styled.img<{ $locked: boolean }>`
  max-width: 92%; max-height: 100%;
  object-fit: contain;
  image-rendering: auto;
  filter: drop-shadow(0 4px 6px rgba(0,0,0,0.5));
  ${p => p.$locked && css`filter: brightness(0);`}
`;

const NameBar = styled.div`
  width: 100%; text-align: center; margin-top: 2px;
`;
const PName = styled.div`
  ${pixelBold}
  font-size: ${FONT.sm}; color: ${C.text};
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  text-shadow: 1px 1px 0 ${C.ink};
`;

const TypePips = styled.div`display: flex; gap: 4px; margin-top: 3px;`;
const Pip = styled.span<{ $c: string }>`
  width: 10px; height: 10px; border-radius: 50%;
  background: ${p => p.$c}; border: 1px solid rgba(255,255,255,0.4);
`;

const Stars = styled.div`display: flex; align-items: center; gap: 1px; margin-top: 3px; height: 13px;`;
const MergeDot = styled.span`
  width: 4px; height: 4px; border-radius: 50%; background: ${C.purple};
  box-shadow: 0 0 4px ${C.purple}aa; margin-left: 2px; flex: none;
`;
const Star = styled.span`font-size: ${ICON.sm}px; line-height: 1; color: ${C.gold}; text-shadow: 0 0 4px ${C.gold}cc;`;

const LockMark = styled.div`
  ${pixelBold}
  position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;
  font-size: 36px; color: ${C.textDim};
  text-shadow: none;
`;

// 광택(glare) — 포인터 위치 추종 하이라이트
const Glare = styled.div`
  position: absolute; inset: 0; pointer-events: none; border-radius: inherit;
  background: radial-gradient(circle at var(--mx) var(--my),
    rgba(255,255,255,0.45), rgba(255,255,255,0) 45%);
  opacity: var(--op); transition: opacity 0.2s ease; mix-blend-mode: soft-light;
`;

// 홀로그래픽 무지개 — Gold+ 전용
const Holo = styled.div`
  position: absolute; inset: 0; pointer-events: none; border-radius: inherit;
  background: linear-gradient(115deg,
    transparent 20%, #ff00cc55 36%, #00ffe055 43%, #ffe60055 50%, #00ff8855 57%, transparent 72%);
  background-size: 200% 200%;
  mix-blend-mode: color-dodge;
  opacity: calc(var(--op) * 0.7);
  animation: ${holoShift} 3s linear infinite;
  transition: opacity 0.25s ease;
`;

const NewBadge = styled.div`
  ${pixelBold}
  position: absolute; top: 6px; left: 0;
  background: ${C.red}; color: ${C.text};
  border: 2px solid ${C.ink};
  font-size: ${FONT.sm}; line-height: 1;
  padding: ${SP.xs} ${SP.sm};
  text-shadow: none;
`;
