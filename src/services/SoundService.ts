// src/services/SoundService.ts

import { Howl, Howler } from 'howler';
import { saveService } from './SaveService';

/**
 * BGM 트랙 목록.
 *
 * 원본은 57분짜리 한 덩어리(36.8MB)였는데, 그걸 그대로 물리면 브라우저가
 * **재생 시작과 동시에 파일 전체를 당긴다**. 게다가 그 크기는 브라우저 디스크
 * 캐시의 항목당 상한을 넘어서 캐시에 얹히지도 않아, 재방문할 때마다 처음부터
 * 다시 받았다(실측: 세션당 약 70MB — range 재요청까지 겹쳐 파일 크기의 2배).
 *
 * 그래서 5분 단위로 잘랐다. `ffmpeg -c copy` 라 **재인코딩이 없고 음질은 원본과
 * 동일**하다(청크 길이 합계 3409.728s vs 원본 3409.706s — 경계당 2ms). 효과는 둘:
 *   ① 들은 만큼만 받는다   — 20분 세션이면 4개(12MB), 예전엔 무조건 70MB
 *   ② 캐시가 실제로 먹는다 — 3MB짜리는 브라우저를 껐다 켜도 0바이트(실측)
 *
 * ⚠ 경로를 `${i}` 로 조립하지 않고 전부 적어 둔다. 확장자·이름이 바뀔 때
 *   조립식 경로는 한 곳만 빠뜨려도 조용히 깨진다(맵 이미지에서 실제로 겪음 —
 *   SPA 폴백 때문에 없는 파일이 404가 아니라 index.html 200 으로 온다).
 * 원본과 재생성 명령은 assets-src/audio/ 에 있다.
 */
const BGM_TRACKS = [
  '/sounds/dj-pikachu-00.m4a',
  '/sounds/dj-pikachu-01.m4a',
  '/sounds/dj-pikachu-02.m4a',
  '/sounds/dj-pikachu-03.m4a',
  '/sounds/dj-pikachu-04.m4a',
  '/sounds/dj-pikachu-05.m4a',
  '/sounds/dj-pikachu-06.m4a',
  '/sounds/dj-pikachu-07.m4a',
  '/sounds/dj-pikachu-08.m4a',
  '/sounds/dj-pikachu-09.m4a',
  '/sounds/dj-pikachu-10.m4a',
  '/sounds/dj-pikachu-11.m4a',
];

/** 오디오 재생을 풀어 주는 사용자 조작. 브라우저 자동재생 정책이 요구하는 것과 같은 목록. */
const GESTURE_EVENTS = ['pointerdown', 'keydown', 'touchstart'] as const;

/**
 * 다음 청크를 미리 받기 시작할 시점(현재 청크가 끝나기 전).
 * 3MB라 20초면 느린 회선에서도 충분히 버퍼된다. 이보다 훨씬 일찍 만들면
 * "들은 만큼만 받는다"는 이득이 그만큼 깎인다(항상 한 청크를 앞질러 받게 되므로).
 */
const PREFETCH_LEAD_MS = 20_000;

class SoundService {
  private static instance: SoundService;

  private musicVolume = 0.5;
  private currentBGM: Howl | null = null;
  private trackIndex = 0;

  /** 미리 만들어 둔 다음 청크. 경계에서 새로 만들면 그때부터 받기 시작해 소리가 끊긴다. */
  private nextBGM: Howl | null = null;
  private nextIndex = -1;
  private prefetchTimer: number | null = null;

  // [대역폭] 첫 사용자 조작이 있기 전에는 트랙을 만들지 않는다. armGestureUnlock 주석 참조.
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
   * 브라우저가 곧바로 트랙을 받기 시작했다. 자동재생 정책 때문에 소리는 나지도
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
      // [대역폭] 볼륨만 0으로 두면 <audio>는 스트림을 계속 받는다.
      //   "껐는데도 데이터는 나가는" 상태였다. 일시정지하면 버퍼링이 멈추고,
      //   재생 위치는 남아 있어 다시 올릴 때 이어서 나온다(다시 받지 않는다).
      this.currentBGM.pause();
      this.clearPrefetchTimer();
    } else if (!this.currentBGM.playing()) {
      this.currentBGM.play();
      this.armPrefetch();
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
      this.armPrefetch();
      console.log('BGM 재생 재개');
      return;
    }

    this.startTrack(this.trackIndex);
  }

  stopBGM() {
    this.clearPrefetchTimer();
    if (this.currentBGM) {
      this.currentBGM.stop();
      this.currentBGM.unload();
      this.currentBGM = null;
    }
    if (this.nextBGM) {
      this.nextBGM.unload();
      this.nextBGM = null;
      this.nextIndex = -1;
    }
  }

  /** 청크 하나를 재생하고, 끝나면 다음 청크로 이어 붙인다(마지막 다음은 처음으로). */
  private startTrack(index: number): void {
    const howl = this.nextIndex === index && this.nextBGM ? this.nextBGM : this.createTrack(index);
    this.nextBGM = null;
    this.nextIndex = -1;

    this.trackIndex = index;
    this.currentBGM = howl;
    howl.volume(this.musicVolume);
    howl.once('end', () => this.startTrack(this.nextTrackIndex()));
    howl.play();
    this.armPrefetch();
  }

  private createTrack(index: number): Howl {
    const howl = new Howl({
      src: [BGM_TRACKS[index]],
      volume: this.musicVolume,
      // [대역폭] html5:true — Web Audio 모드(html5:false)는 XHR로 파일 '전체'를 받아
      //   디코드한 뒤에야 재생한다. <audio>로 흘리면 브라우저 캐시도 그대로 재사용된다.
      html5: true,
    });
    // 청크 하나를 못 받아도 음악이 거기서 끝나 버리면 안 된다 — 다음 청크로 넘긴다.
    howl.once('loaderror', () => {
      console.warn('[BGM] 청크 로드 실패, 건너뜁니다:', BGM_TRACKS[index]);
      if (this.currentBGM === howl) this.startTrack(this.nextTrackIndex());
    });
    return howl;
  }

  private nextTrackIndex(): number {
    return (this.trackIndex + 1) % BGM_TRACKS.length;
  }

  /**
   * 현재 청크가 끝나기 PREFETCH_LEAD_MS 전에 다음 청크를 만들어 둔다(= 그때부터 받기 시작).
   * duration()은 로드가 끝나야 값이 잡히므로, 아직이면 1초 뒤 다시 본다.
   */
  private armPrefetch(): void {
    this.clearPrefetchTimer();
    const howl = this.currentBGM;
    if (!howl) return;

    const schedule = () => {
      if (this.currentBGM !== howl) return;
      const duration = howl.duration();
      const seek = typeof howl.seek() === 'number' ? (howl.seek() as number) : 0;
      const remainMs = (duration - seek) * 1000;
      if (!Number.isFinite(remainMs) || remainMs <= 0) {
        this.prefetchTimer = window.setTimeout(schedule, 1000);
        return;
      }
      this.prefetchTimer = window.setTimeout(() => {
        if (this.currentBGM !== howl || this.nextBGM) return;
        this.nextIndex = this.nextTrackIndex();
        this.nextBGM = this.createTrack(this.nextIndex);
        this.warmUp(this.nextBGM);
      }, Math.max(0, remainMs - PREFETCH_LEAD_MS));
    };
    schedule();
  }

  /**
   * 다음 청크를 무음으로 잠깐 돌렸다가 되감아 둔다. 디코더를 미리 깨우는 것.
   *
   * 파일을 다 받아 놨어도 `<audio>` 는 첫 play() 에서 디코더를 세우느라 소리가
   * 늦게 난다. 이게 청크 경계에 그대로 무음으로 나타났다 —
   * **웜업 없음 66ms · 웜업 적용 0.4ms**(브라우저 계측, 20초 청크로 경계 2회).
   * 5분마다 한 번씩 나던 딸꾹질이 사라진다.
   *
   * 볼륨 0으로 돌리므로 웜업 자체는 들리지 않고, 되감아 두므로 실제 재생은
   * 청크 처음부터 시작한다. 네트워크 요청도 늘지 않는다(같은 엘리먼트다).
   */
  private warmUp(howl: Howl): void {
    const start = () => {
      howl.volume(0);
      howl.play();
      window.setTimeout(() => {
        howl.pause();
        howl.seek(0);
        howl.volume(this.musicVolume);
      }, 250);
    };
    if (howl.state() === 'loaded') start(); else howl.once('load', start);
  }

  private clearPrefetchTimer(): void {
    if (this.prefetchTimer !== null) {
      window.clearTimeout(this.prefetchTimer);
      this.prefetchTimer = null;
    }
  }
}

export const soundService = SoundService.getInstance();
