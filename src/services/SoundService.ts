// src/services/SoundService.ts

import { Howl, Howler } from 'howler';
import { saveService } from './SaveService';

class SoundService {
  private static instance: SoundService;
  
  private musicVolume = 0.5;
  private currentBGM: Howl | null = null;

  private constructor() {
    const settings = saveService.load().settings;
    this.musicVolume = settings.musicVolume;
    
    Howler.volume(1.0);
    this.playBGM();
  }
  
  static getInstance() {
    if (!SoundService.instance) {
      SoundService.instance = new SoundService();
    }
    return SoundService.instance;
  }
  
  setMusicVolume(volume: number) {
    this.musicVolume = Math.max(0, Math.min(1, volume));
    if (this.currentBGM) {
      this.currentBGM.volume(this.musicVolume);
    } else if (this.musicVolume > 0) {
      // 음소거로 시작해 로드를 건너뛴 상태 — 볼륨을 올리는 지금 처음 받아온다.
      this.playBGM();
    }
  }

  playBGM() {
    // [대역폭] 음소거 상태면 트랙을 아예 받지 않는다. 예전엔 볼륨 0이어도
    //   서비스 초기화 시점에 무조건 받아서, 음악을 끈 유저도 트래픽을 냈다.
    if (this.musicVolume <= 0) return;

    if (this.currentBGM && this.currentBGM.playing()) {
      return;
    }
    
    if (this.currentBGM) {
      this.currentBGM.play();
      console.log('BGM 재생 재개');
      return;
    }
    
    const track = '/sounds/dj-pikachu.m4a';
    // [대역폭] html5:true — Web Audio 모드(html5:false)는 XHR로 파일 '전체'를 받아
    //   디코드한 뒤에야 재생한다. 이 트랙은 57분·36MB라, 30초만 듣고 나가도 36MB가
    //   그대로 청구됐다. <audio> 스트리밍으로 바꾸면 브라우저가 필요한 만큼만
    //   range 요청하고 캐시도 재사용한다.
    const bgm = new Howl({
      src: [track],
      volume: this.musicVolume,
      loop: true,
      html5: true,
    });

    this.currentBGM = bgm;
    const playId = bgm.play();
    console.log('BGM 재생 시도:', track, 'Play ID:', playId);
  }
  
  stopBGM() {
    if (this.currentBGM) {
      this.currentBGM.stop();
      this.currentBGM.unload();
      this.currentBGM = null;
    }
  }
}

export const soundService = SoundService.getInstance();