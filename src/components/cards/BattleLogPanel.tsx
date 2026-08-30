// src/components/cards/BattleLogPanel.tsx
// 오토배틀 전투 로그 패널 — 재생된 스텝까지의 로그를 턴 구분선과 함께 표시.
// TrainerTower / RandomBattle 공용. CardBattleService의 BattleLogEntry를 그대로 소비.

import { useEffect, useMemo, useRef } from 'react';
import styled from 'styled-components';
import { ScrollText, Flame, Skull, Zap, Snowflake } from 'lucide-react';
import { media } from '../../utils/responsive.utils';
import { getTypeColor } from '../../utils/typeEffectiveness';
import { useTranslation } from '../../i18n';
import { C, FONT, SP, SCALE, TYPE_COLOR } from '../../styles/tokens';
import { win, pixelText, pixelBold } from '../../styles/pixel';
import {
  BattleCard, BattleLogEntry, StatusKind, BURN_TURNS, POISON_TURNS,
} from '../../services/CardBattleService';

// 상태이상 색은 대응하는 타입 색을 그대로 쓴다(화상=불꽃, 독=독, 마비=전기, 얼음=얼음).
// 따로 만들면 같은 개념에 색이 두 벌 생긴다.
const STATUS_COLOR: Record<StatusKind, string> = {
  burn: TYPE_COLOR.fire, poison: TYPE_COLOR.poison,
  paralyze: TYPE_COLOR.electric, freeze: TYPE_COLOR.ice,
};

// ─── 아레나 유닛 상태이상 표시 (TrainerTower/RandomBattle 공용) ────────────────
/** uid → 현재 걸린 상태이상(재생 시점 기준). */
export type UnitStatusMap = Record<string, { kind: StatusKind; ticksLeft: number } | undefined>;

/** 로그 엔트리 1개를 반영한 다음 상태 맵. 재생 스텝마다 fold. */
export function nextStatusMap(map: UnitStatusMap, e: BattleLogEntry): UnitStatusMap {
  // 기절하면 상태 제거
  if (e.fainted) {
    if (!map[e.targetUid]) return map;
    const m = { ...map }; delete m[e.targetUid]; return m;
  }
  // 마비/빙결은 행동 스킵으로 소모
  if (e.kind === 'skip' && e.status) {
    if (!map[e.targetUid]) return map;
    const m = { ...map }; delete m[e.targetUid]; return m;
  }
  // 지속피해 틱 — 남은 턴 차감, 0이면 해제
  if (e.kind === 'dot' && e.status) {
    const cur = map[e.targetUid];
    if (!cur || cur.kind !== e.status) return map;
    const m = { ...map };
    if (cur.ticksLeft <= 1) delete m[e.targetUid];
    else m[e.targetUid] = { kind: cur.kind, ticksLeft: cur.ticksLeft - 1 };
    return m;
  }
  // 공격으로 상태이상 부여
  if ((!e.kind || e.kind === 'attack') && e.inflicted) {
    const ticks = e.inflicted === 'burn' ? BURN_TURNS : e.inflicted === 'poison' ? POISON_TURNS : 1;
    return { ...map, [e.targetUid]: { kind: e.inflicted, ticksLeft: ticks } };
  }
  return map;
}

const STATUS_ICON: Record<StatusKind, typeof Flame> = {
  burn: Flame, poison: Skull, paralyze: Zap, freeze: Snowflake,
};

/** 유닛 스프라이트 위에 얹는 상태이상 뱃지. 부모가 position:relative여야 함. */
export const UnitStatusBadge = ({ kind }: { kind: StatusKind }) => {
  const Icon = STATUS_ICON[kind];
  return <SBadge $c={STATUS_COLOR[kind]}><Icon size={9} /></SBadge>;
};
/** 동그라미 + 번진 그림자였던 걸 각진 칸 + 잉크 테두리로. 도트 문법(docs/DESIGN.md). */
const SBadge = styled.span<{ $c: string }>`
  position: absolute; top: -3px; right: 3px; width: 16px; height: 16px;
  display: flex; align-items: center; justify-content: center;
  background: ${p => p.$c}; color: ${C.text};
  border: ${SCALE}px solid ${C.ink};
  z-index: 2;
`;

interface Props {
  log: BattleLogEntry[];
  units: Record<string, BattleCard>;
  /** 현재까지 재생된 로그 수(재생 step). 이만큼만 표시. */
  count: number;
}

export const BattleLogPanel = ({ log, units, count }: Props) => {
  const { t } = useTranslation();
  const bodyRef = useRef<HTMLDivElement>(null);

  const clampedCount = Math.max(0, Math.min(count, log.length));

  // 로그 엔트리별 element 그룹을 '전체 로그' 기준으로 1회만 생성.
  // 재생 step(count)마다 전체를 다시 만들던 O(n²)를 O(n)으로 — 노출은 아래 slice로 제어.
  const groups = useMemo(() => {
    const statusName = (s: StatusKind) => t(`cards.battleLog.status${s.charAt(0).toUpperCase() + s.slice(1)}`);
    const out: JSX.Element[][] = [];
    let lastTurn = 0;
    log.forEach((e, i) => {
      const g: JSX.Element[] = [];
      if (e.turn !== lastTurn) {
        lastTurn = e.turn;
        g.push(<TurnDivider key={`turn-${e.turn}`}>{t('cards.battleLog.turn', { n: e.turn })}</TurnDivider>);
      }
      const atk = units[e.attackerUid];
      const tgt = units[e.targetUid];

      if (e.kind === 'dot' && e.status) {
        // 지속피해 틱: [대상] [화상/독] -N
        g.push(
          <Line key={i}>
            <Name $side={tgt?.side ?? 'enemy'}>{tgt?.name ?? '???'}</Name>
            <Badge $c={STATUS_COLOR[e.status]}>{statusName(e.status)}</Badge>
            <Dmg $crit={false}>-{e.damage}</Dmg>
          </Line>,
        );
      } else if (e.kind === 'skip' && e.status) {
        // 마비/빙결: [대상] [마비] 행동 불가
        g.push(
          <Line key={i}>
            <Name $side={tgt?.side ?? 'enemy'}>{tgt?.name ?? '???'}</Name>
            <Badge $c={STATUS_COLOR[e.status]}>{statusName(e.status)}</Badge>
            <SkipText>{t('cards.battleLog.skipAction')}</SkipText>
          </Line>,
        );
      } else if (e.kind === 'heal') {
        // 흡혈 회복: [유닛] +N 회복
        g.push(
          <Line key={i}>
            <Name $side={tgt?.side ?? 'player'}>{tgt?.name ?? '???'}</Name>
            <HealText>+{e.damage} {t('cards.battleLog.heal')}</HealText>
          </Line>,
        );
      } else {
        g.push(
          <Line key={i}>
            <Name $side={atk?.side ?? 'player'}>{atk?.name ?? '???'}</Name>
            {/* 이중타입은 상대에게 더 잘 통하는 쪽으로 때린다 — 어느 타입을 썼는지 표시 */}
            {e.moveType && <Badge $c={getTypeColor(e.moveType)}>{t(`types.${e.moveType}`)}</Badge>}
            <Arrow>→</Arrow>
            <Name $side={tgt?.side ?? 'enemy'}>{tgt?.name ?? '???'}</Name>
            {/* 무효는 '-0' 대신 아래 '효과 없음' 뱃지로만 표기 */}
            {e.effectiveness > 0 && <Dmg $crit={e.isCrit}>-{e.damage}</Dmg>}
            {e.isCrit && <Badge $c={C.gold}>{t('cards.battleLog.crit')}</Badge>}
            {e.effectiveness >= 2 && <Badge $c={C.teal}>{t('cards.battleLog.superEffective')}</Badge>}
            {e.effectiveness > 0 && e.effectiveness <= 0.5 && <Badge $c={C.plain}>{t('cards.battleLog.notEffective')}</Badge>}
            {e.effectiveness === 0 && <Badge $c={C.textDim}>{t('cards.battleLog.immune')}</Badge>}
            {e.inflicted && <Badge $c={STATUS_COLOR[e.inflicted]}>{statusName(e.inflicted)}</Badge>}
          </Line>,
        );
      }

      if (e.fainted) {
        g.push(
          <FaintLine key={`f${i}`}>
            {t('cards.battleLog.fainted', { name: tgt?.name ?? '???' })}
          </FaintLine>,
        );
      }
      out.push(g);
    });
    return out;
  }, [log, units, t]);

  // 재생된 엔트리 수만큼만 노출
  const rows = useMemo(() => groups.slice(0, clampedCount).flat(), [groups, clampedCount]);

  // 새 로그가 붙을 때마다 맨 아래로 자동 스크롤
  useEffect(() => {
    const el = bodyRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [clampedCount]);

  return (
    <Root>
      <Head><ScrollText size={14} /> {t('cards.battleLog.title')}</Head>
      <Body ref={bodyRef}>
        {rows.length === 0 ? <Waiting>{t('cards.battleLog.waiting')}</Waiting> : rows}
      </Body>
    </Root>
  );
};

// ─── styled ──────────────────────────────────────────────────────────────────
// docs/DESIGN.md 의 디자인 시스템을 따른다.

const Root = styled.aside`
  ${win('plain')}
  ${pixelText}
  color: ${C.text};
  flex: 0 0 290px; min-width: 0; display: flex; flex-direction: column;
  overflow: hidden; max-height: 520px;
  ${media.tablet} { flex: 0 0 auto; width: 100%; max-height: 200px; }
`;
const Head = styled.div`
  ${pixelBold}
  display: flex; align-items: center; gap: ${SP.xs};
  padding: ${SP.xs} ${SP.sm};
  font-size: ${FONT.sm}; color: ${C.gold};
  background: ${C.panelSunk};
  border-bottom: ${SCALE}px solid ${C.ink};
`;
const Body = styled.div`
  flex: 1; overflow-y: auto; padding: ${SP.sm};
  display: flex; flex-direction: column; gap: ${SP.xs};

  &::-webkit-scrollbar { width: 10px; }
  &::-webkit-scrollbar-track { background: ${C.panelSunk}; border: ${SCALE}px solid ${C.ink}; }
  &::-webkit-scrollbar-thumb { background: ${C.divider}; border: ${SCALE}px solid ${C.ink}; }
`;
const Waiting = styled.div`font-size: ${FONT.sm}; color: ${C.textDim}; padding: ${SP.xs} 0;`;
const TurnDivider = styled.div`
  ${pixelBold}
  display: flex; align-items: center; gap: ${SP.sm}; margin: ${SP.xs} 0 0;
  font-size: ${FONT.sm}; color: ${C.purple};
  &::before, &::after { content: ''; flex: 1; height: ${SCALE}px; background: ${C.divider}; }
`;
const Line = styled.div`
  display: flex; align-items: center; gap: ${SP.xs}; flex-wrap: wrap;
  font-size: ${FONT.sm};
`;
const Name = styled.span<{ $side: 'player' | 'enemy' }>`
  ${pixelBold}
  color: ${p => (p.$side === 'enemy' ? C.red : C.green)};
  max-width: 84px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
`;
const Arrow = styled.span`color: ${C.textDim}; font-size: ${FONT.sm};`;
const Dmg = styled.span<{ $crit: boolean }>`
  ${pixelBold}
  color: ${p => (p.$crit ? C.gold : C.text)};
`;
const Badge = styled.span<{ $c: string }>`
  ${pixelBold}
  font-size: ${FONT.sm}; line-height: 1.3; color: ${p => p.$c};
  border: 2px solid ${C.ink};
  background: ${C.panelSunk};
  padding: ${SP.xs} ${SP.sm}; white-space: nowrap;
`;
const FaintLine = styled.div`
  ${pixelBold}
  font-size: ${FONT.sm}; color: ${C.red}; padding-left: ${SP.sm};
`;
const SkipText = styled.span`${pixelBold} font-size: ${FONT.sm}; color: ${C.textSub};`;
const HealText = styled.span`
  ${pixelBold}
  font-size: ${FONT.sm}; color: ${C.green};
`;
