// src/services/SoundService.ts

import { Howl, Howler } from 'howler';
import { saveService } from './SaveService';

/** 오디오 재생을 풀어 주는 사용자 조작. 브라우저 자동재생 정책이 요구하는 것과 같은 목록. */
const GESTURE_EVENTS = ['pointerdown', 'keydown', 'touchstart'] as const;

class SoundService {
  private static instance: SoundService;
  
  private musicVolume = 0.5;
  private currentBGM: Howl | null = null;

  // [대역폭] 첫 사용자 조작이 있기 전에는 트랙을 만들지 않는다. 아래 armGestureUnlock 주석 참조.
  private userGestured = false;
  private playPending = false;

  private constructor() {
    const settings = saveService.load().settings;
    this.musicVolume = settings.musicVolume;
    
    Howler.volume(1.0);
    this.armGestureUnlock();
    this.playBGM();
  }
  
  static getInstance() {
    if (!SoundService.instance) {
      SoundService.instance = new SoundService();
    }
    return SoundService.instance;
  }

  /**
   * [대역폭] 첫 클릭·키입력·터치가 올 때까지 BGM 생성을 미룬다.
   *
   * 이 서비스는 Settings → FloatingSettings → App 경로로 **앱 부팅 시점에** import된다.
   * 예전엔 그 순간 Howl을 만들었고, html5:true는 `<audio preload="auto">`를 뜻하므로
   * 브라우저가 곧바로 36MB 트랙을 받기 시작했다. 자동재생 정책 때문에 소리는 나지도
   * 않는데(조작 전에는 재생이 차단된다) 트래픽만 나갔다 — 로그인 화면만 보고 나간
   * 방문자도 청구 대상이었다.
   *
   * 조작이 있어야 재생이 가능하므로, 그때까지 미뤄도 들리는 시점은 달라지지 않는다.
   * 오히려 진짜 제스처 위에서 play()가 불려 자동재생 거부를 겪지 않는다.
   */
  private armGestureUnlock(): void {
    if (typeof window === 'undefined') return;
    const onGesture = () => {
      if (this.userGestured) return;
      this.userGestured = true;
      GESTURE_EVENTS.forEach(t => window.removeEventListener(t, onGesture, true));
      if (this.playPending) {
        this.playPending = false;
        this.playBGM();
      }
    };
    // 캡처 단계로 듣는다 — 중간 컴포넌트가 stopPropagation()을 걸어도 놓치지 않는다.
    GESTURE_EVENTS.forEach(t => window.addEventListener(t, onGesture, { capture: true, passive: true }));
  }
  
  setMusicVolume(volume: number) {
    this.musicVolume = Math.max(0, Math.min(1, volume));

    if (!this.currentBGM) {
      // 음소거로 시작해(또는 조작 전이라) 로드를 건너뛴 상태 — 볼륨을 올리는 지금 처음 받아온다.
      if (this.musicVolume > 0) this.playBGM();
      return;
    }

    this.currentBGM.volume(this.musicVolume);
    if (this.musicVolume <= 0) {
      // [대역폭] 볼륨만 0으로 두면 <audio>는 스트림을 계속 받는다. 36MB 트랙이라
      //   "껐는데도 데이터는 나가는" 상태였다. 일시정지하면 버퍼링이 멈추고,
      //   재생 위치는 남아 있어 다시 올릴 때 이어서 나온다(다시 받지 않는다).
      this.currentBGM.pause();
    } else if (!this.currentBGM.playing()) {
      this.currentBGM.play();
    }
  }

  playBGM() {
    // [대역폭] 음소거 상태면 트랙을 아예 받지 않는다. 예전엔 볼륨 0이어도
    //   서비스 초기화 시점에 무조건 받아서, 음악을 끈 유저도 트래픽을 냈다.
    if (this.musicVolume <= 0) return;

    // [대역폭] 아직 사용자 조작이 없으면 만들지 않는다 — 어차피 재생도 차단된다.
    if (!this.userGestured) {
      this.playPending = true;
      return;
    }

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
