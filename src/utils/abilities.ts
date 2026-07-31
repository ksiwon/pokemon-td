// src/utils/abilities.ts

import { PokemonAbility } from '../types/game';
import { WireAbility } from '../types/multiplayer';
import { PokemonAbilityData } from '../api/pokeapi';
import { rng } from './rng';

/**
 * 특성 → 와이어 표현. 설명문을 떼어 낸 압축본만 RTDB 로 보낸다.
 * 업로드/정규화 양쪽(towerFactory.buildTowerDetails, MultiplayerService.normalizeTowerDetails)이
 * 이 함수 하나만 쓰도록 해서 필드 목록이 두 곳에서 갈라지지 않게 한다.
 */
export function toWireAbility(a: { name?: string; displayName?: string; effect: PokemonAbility['effect']; value?: number }): WireAbility {
  return {
    name: a.name ?? '',
    displayName: a.displayName ?? '',
    effect: a.effect,
    value: a.value ?? 0,
  };
}

/** 와이어 특성 → 로컬 특성. 설명문은 왕복에서 사라지므로 빈 문자열로 되살린다. */
export function fromWireAbility(a: WireAbility | null | undefined): PokemonAbility | undefined {
  if (!a || !a.effect) return undefined;
  return { name: a.name ?? '', displayName: a.displayName ?? '', description: '', effect: a.effect, value: a.value ?? 0 };
}

/**
 * 특성 이름을 기반으로 게임 내 특성 효과를 매핑
 * PokeAPI의 특성 이름을 게임 효과로 변환
 */
export function mapAbilityToGameEffect(abilityData: PokemonAbilityData): PokemonAbility {
  const name = abilityData.name.toLowerCase(); // 로직은 영문 key 기준
  const description = abilityData.description;
  const displayName = abilityData.displayName; // 현지화된 이름 사용

  // 공격 관련 특성
  if (name.includes('guts') || name.includes('overgrow') || name.includes('torrent') || 
      name.includes('blaze') || name.includes('swarm') || name.includes('huge-power') || 
      name.includes('pure-power') || name.includes('hustle')) {
    return {
      name: abilityData.name,
      displayName: displayName,
      description: description,
      effect: 'crit',
      value: 2.0 // 크리티컬 확률 2배
    };
  }
  
  // 흡혈 관련 특성
  if (name.includes('regenerator') || name.includes('volt-absorb') || 
      name.includes('water-absorb') || name.includes('sap-sipper')) {
    return {
      name: abilityData.name,
      displayName: displayName,
      description: description,
      effect: 'lifesteal',
      value: 0.15 // 15% 흡혈
    };
  }
  
  // 광역 관련 특성
  if (name.includes('pixilate') || name.includes('aerilate') || 
      name.includes('refrigerate') || name.includes('galvanize')) {
    return {
      name: abilityData.name,
      displayName: displayName,
      description: description,
      effect: 'aoe',
      value: 1.2 // AOE 데미지 20% 증가
    };
  }
  
  // 속도 관련 특성
  if (name.includes('speed-boost') || name.includes('chlorophyll') || 
      name.includes('swift-swim') || name.includes('sand-rush') || 
      name.includes('slush-rush') || name.includes('unburden')) {
    return {
      name: abilityData.name,
      displayName: displayName,
      description: description,
      effect: 'speed',
      value: 1.5 // 공격 속도 50% 증가
    };
  }
  
  // 방어/탱커 관련 특성
  if (name.includes('thick-fat') || name.includes('multiscale') || 
      name.includes('solid-rock') || name.includes('filter') || 
      name.includes('prism-armor') || name.includes('fluffy')) {
    return {
      name: abilityData.name,
      displayName: displayName,
      description: description,
      effect: 'tank',
      value: 0.75 // 받는 데미지 25% 감소
    };
  }
  
  // 기본 특성이 없으면 랜덤으로 하나 부여
  const randomEffects: Array<{ effect: PokemonAbility['effect'], value: number }> = [
    { effect: 'crit', value: 1.5 },
    { effect: 'lifesteal', value: 0.1 },
    { effect: 'speed', value: 1.2 },
    { effect: 'tank', value: 0.85 },
  ];
  const randomEffect = randomEffects[Math.floor(rng() * randomEffects.length)];
  
  return {
    name: abilityData.name,
    displayName: displayName,
    description: description,
    effect: randomEffect.effect,
    value: randomEffect.value
  };
}

/**
 * 특성 효과를 적용하여 스탯을 조정
 */
export function applyAbilityEffects(
  baseValue: number, 
  ability: PokemonAbility | undefined, 
  effectType: 'damage' | 'defense' | 'speed'
): number {
  if (!ability) return baseValue;
  switch (effectType) {
    case 'damage':
      if (ability.effect === 'crit') {
        // 크리티컬 관련 특성은 실제 공격 시 처리
        return baseValue;
      }
      return baseValue;
      
    case 'defense':
      if (ability.effect === 'tank') {
        return baseValue * (1 / ability.value); // 방어력 증가 효과
      }
      return baseValue;
    case 'speed':
      if (ability.effect === 'speed') {
        return baseValue * ability.value;
      }
      return baseValue;
      
    default:
      return baseValue;
  }
}

/**
 * 크리티컬 확률 계산 (특성 고려)
 */
/**
 * 기본 크리티컬 확률 — 본가와 동일한 1/24 (4.17%).
 * 전 엔진 공용 상수. 예전엔 싱글TD만 1/24이고 아레나·AI서비스의 폴백은 0.0625,
 * 카드는 0.0625 하드코딩이라 세 값이 공존했다. 멀티는 buildTowerDetails가
 * getCriticalChance로 채워 실제로는 1/24이 들어가므로 폴백 0.0625는 죽은 값이면서,
 * critChance가 비는 순간 조용히 6.25%가 되는 함정이었다.
 */
export const BASE_CRIT_CHANCE = 1 / 24;

export function getCriticalChance(ability: PokemonAbility | undefined): number {
  if (ability && ability.effect === 'crit') {
    return BASE_CRIT_CHANCE * ability.value;
  }

  return BASE_CRIT_CHANCE;
}

/**
 * 흡혈 비율 계산 (특성 고려)
 */
export function getLifestealRatio(ability: PokemonAbility | undefined): number {
  if (ability && ability.effect === 'lifesteal') {
    return ability.value;
  }
  
  return 0;
}

/**
 * AOE 데미지 배율 계산 (특성 고려)
 */
export function getAOEDamageMultiplier(ability: PokemonAbility | undefined): number {
  if (ability && ability.effect === 'aoe') {
    return ability.value;
  }
  
  return 1.0;
}