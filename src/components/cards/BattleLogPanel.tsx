// src/components/cards/BattleLogPanel.tsx
// 오토배틀 전투 로그 패널 — 재생된 스텝까지의 로그를 턴 구분선과 함께 표시.
// TrainerTower / RandomBattle 공용. CardBattleService의 BattleLogEntry를 그대로 소비.

import { useEffect, useMemo, useRef } from 'react';
import styled from 'styled-components';
import { ScrollText } from 'lucide-react';
import { media } from '../../utils/responsive.utils';
import { useTranslation } from '../../i18n';
import { BattleCard, BattleLogEntry, StatusKind } from '../../services/CardBattleService';

const STATUS_COLOR: Record<StatusKind, string> = {
  burn: '#f97316', poison: '#a855f7', paralyze: '#eab308', freeze: '#38bdf8',
};

interface Props {
  log: BattleLogEntry[];
  units: Record<string, BattleCard>;
  /** 현재까지 재생된 로그 수(재생 step). 이만큼만 표시. */
  count: number;
}

export const BattleLogPanel = ({ log, units, count }: Props) => {
  const { t } = useTranslation();
  const bodyRef = useRef<HTMLDivElement>(null);

  const shown = useMemo(() => log.slice(0, Math.max(0, count)), [log, count]);

  // 새 로그가 붙을 때마다 맨 아래로 자동 스크롤
  useEffect(() => {
    const el = bodyRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [shown.length]);

  const statusName = (s: StatusKind) => t(`cards.battleLog.status${s.charAt(0).toUpperCase() + s.slice(1)}`);

  const rows = useMemo(() => {
    const out: JSX.Element[] = [];
    let lastTurn = 0;
    shown.forEach((e, i) => {
      if (e.turn !== lastTurn) {
        lastTurn = e.turn;
        out.push(<TurnDivider key={`turn-${e.turn}`}>{t('cards.battleLog.turn', { n: e.turn })}</TurnDivider>);
      }
      const atk = units[e.attackerUid];
      const tgt = units[e.targetUid];

      if (e.kind === 'dot' && e.status) {
        // 지속피해 틱: [대상] [화상/독] -N
        out.push(
          <Line key={i}>
            <Name $side={tgt?.side ?? 'enemy'}>{tgt?.name ?? '???'}</Name>
            <Badge $c={STATUS_COLOR[e.status]}>{statusName(e.status)}</Badge>
            <Dmg $crit={false}>-{e.damage}</Dmg>
          </Line>,
        );
      } else if (e.kind === 'skip' && e.status) {
        // 마비/빙결: [대상] [마비] 행동 불가
        out.push(
          <Line key={i}>
            <Name $side={tgt?.side ?? 'enemy'}>{tgt?.name ?? '???'}</Name>
            <Badge $c={STATUS_COLOR[e.status]}>{statusName(e.status)}</Badge>
            <SkipText>{t('cards.battleLog.skipAction')}</SkipText>
          </Line>,
        );
      } else if (e.kind === 'heal') {
        // 흡혈 회복: [유닛] +N 회복
        out.push(
          <Line key={i}>
            <Name $side={tgt?.side ?? 'player'}>{tgt?.name ?? '???'}</Name>
            <HealText>+{e.damage} {t('cards.battleLog.heal')}</HealText>
          </Line>,
        );
      } else {
        out.push(
          <Line key={i}>
            <Name $side={atk?.side ?? 'player'}>{atk?.name ?? '???'}</Name>
            <Arrow>→</Arrow>
            <Name $side={tgt?.side ?? 'enemy'}>{tgt?.name ?? '???'}</Name>
            <Dmg $crit={e.isCrit}>-{e.damage}</Dmg>
            {e.isCrit && <Badge $c="#fbbf24">{t('cards.battleLog.crit')}</Badge>}
            {e.effectiveness >= 2 && <Badge $c="#34d399">{t('cards.battleLog.superEffective')}</Badge>}
            {e.effectiveness > 0 && e.effectiveness <= 0.5 && <Badge $c="#94a3b8">{t('cards.battleLog.notEffective')}</Badge>}
            {e.effectiveness === 0 && <Badge $c="#64748b">{t('cards.battleLog.immune')}</Badge>}
            {e.inflicted && <Badge $c={STATUS_COLOR[e.inflicted]}>{statusName(e.inflicted)}</Badge>}
          </Line>,
        );
      }

      if (e.fainted) {
        out.push(
          <FaintLine key={`f${i}`}>
            {t('cards.battleLog.fainted', { name: tgt?.name ?? '???' })}
          </FaintLine>,
        );
      }
    });
    return out;
  }, [shown, units, t]);

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
const Root = styled.aside`
  flex: 0 0 290px; min-width: 0; display: flex; flex-direction: column;
  background: rgba(10, 12, 22, 0.72); border: 1px solid rgba(255,255,255,0.08);
  border-radius: 14px; overflow: hidden; max-height: 520px;
  ${media.tablet} { flex: 0 0 auto; width: 100%; max-height: 200px; }
`;
const Head = styled.div`
  display: flex; align-items: center; gap: 6px; padding: 10px 14px;
  font-size: 12px; font-weight: 800; letter-spacing: 0.08em; color: rgba(255,255,255,0.65);
  border-bottom: 1px solid rgba(255,255,255,0.07); background: rgba(255,255,255,0.03);
`;
const Body = styled.div`
  flex: 1; overflow-y: auto; padding: 10px 12px; display: flex; flex-direction: column; gap: 4px;
  scrollbar-width: thin; scrollbar-color: rgba(255,255,255,0.18) transparent;
`;
const Waiting = styled.div`font-size: 12px; color: rgba(255,255,255,0.35); padding: 8px 2px;`;
const TurnDivider = styled.div`
  display: flex; align-items: center; gap: 8px; margin: 6px 0 2px;
  font-size: 10px; font-weight: 800; color: rgba(192,132,252,0.8); letter-spacing: 0.1em;
  &::before, &::after { content: ''; flex: 1; height: 1px; background: rgba(192,132,252,0.18); }
`;
const Line = styled.div`
  display: flex; align-items: center; gap: 5px; flex-wrap: wrap;
  font-size: 12px; line-height: 1.5;
`;
const Name = styled.span<{ $side: 'player' | 'enemy' }>`
  font-weight: 700; color: ${p => (p.$side === 'enemy' ? '#fca5a5' : '#86efac')};
  max-width: 84px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
`;
const Arrow = styled.span`color: rgba(255,255,255,0.3); font-size: 11px;`;
const Dmg = styled.span<{ $crit: boolean }>`
  font-weight: 800; color: ${p => (p.$crit ? '#fbbf24' : '#e8edf5')};
`;
const Badge = styled.span<{ $c: string }>`
  font-size: 9px; font-weight: 800; color: ${p => p.$c};
  border: 1px solid ${p => p.$c}44; background: ${p => p.$c}14;
  padding: 1px 5px; border-radius: 5px; white-space: nowrap;
`;
const FaintLine = styled.div`
  font-size: 11px; font-weight: 700; color: #f87171; padding-left: 8px;
`;
const SkipText = styled.span`font-size: 11px; font-weight: 700; color: rgba(255,255,255,0.5);`;
const HealText = styled.span`font-size: 12px; font-weight: 800; color: #34d399;`;
