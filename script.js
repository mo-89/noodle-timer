(() => {
  "use strict";

  const DURATION_MS = 180 * 1000; // 3分固定

  const timeEl = document.getElementById("time");
  const statusEl = document.getElementById("status");
  const toggleBtn = document.getElementById("toggleBtn");
  const resetBtn = document.getElementById("resetBtn");
  const unlockSoundBtn = document.getElementById("unlockSoundBtn");

  // --- タイマー状態 ---
  // running中は segmentStart からの経過時間を都度計算する。
  // setIntervalの回数を数えるのではなく「開始時刻からの経過時間」を
  // 毎回計算し直すことで、バックグラウンドやスリープでintervalが
  // 間引かれても復帰時に正しい残り時間になる。
  let accumulatedMs = 0;
  let segmentStart = Date.now();
  let running = true;
  let finished = false;
  let alarmPlaying = false;

  function elapsedMs() {
    return accumulatedMs + (running ? Date.now() - segmentStart : 0);
  }

  function remainingMs() {
    return Math.max(0, DURATION_MS - elapsedMs());
  }

  function formatTime(ms) {
    const totalSec = Math.ceil(ms / 1000);
    const m = Math.floor(totalSec / 60);
    const s = totalSec % 60;
    return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }

  function render() {
    const remaining = remainingMs();
    timeEl.textContent = formatTime(remaining);
    timeEl.classList.toggle("finished", finished);

    if (finished) {
      statusEl.textContent = alarmPlaying ? "できあがり!(音を止める)" : "できあがり!";
    } else if (running) {
      statusEl.textContent = "カウントダウン中…";
    } else {
      statusEl.textContent = "一時停止中";
    }

    toggleBtn.textContent = finished ? "音を止める" : (running ? "停止" : "再開");
  }

  function tick() {
    if (!finished && remainingMs() <= 0) {
      finish();
    }
    render();
  }

  function finish() {
    accumulatedMs += Date.now() - segmentStart;
    finished = true;
    running = false;
    startAlarm();
    render();
  }

  function toggleRunning() {
    if (finished) {
      // 完了後はこのボタンでアラーム停止のみ行う
      stopAlarm();
      render();
      return;
    }
    if (running) {
      accumulatedMs += Date.now() - segmentStart;
      running = false;
    } else {
      segmentStart = Date.now();
      running = true;
    }
    render();
  }

  function reset() {
    stopAlarm();
    accumulatedMs = 0;
    segmentStart = Date.now();
    running = true;
    finished = false;
    render();
  }

  toggleBtn.addEventListener("click", toggleRunning);
  resetBtn.addEventListener("click", reset);

  // 250ms間隔で再計算。バックグラウンドではブラウザに間引かれるが、
  // 表示上は復帰時(visibilitychange)に即座に補正する。
  setInterval(tick, 250);

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      tick();
      tryResumeAudio();
    }
  });

  // ==============================
  // 音声通知 (Web Audio API)
  // ==============================
  let audioCtx = null;
  let alarmTimer = null;

  function getAudioCtx() {
    if (!audioCtx) {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      audioCtx = new Ctx();
    }
    return audioCtx;
  }

  function tryResumeAudio() {
    if (audioCtx && audioCtx.state === "suspended") {
      audioCtx.resume().catch(() => {});
    }
  }

  // 早期にユーザー操作があればその時点でAudioContextを起動しておく
  ["pointerdown", "touchstart", "keydown"].forEach((evt) => {
    document.addEventListener(
      evt,
      () => {
        getAudioCtx();
        tryResumeAudio();
      },
      { passive: true }
    );
  });

  function beep(ctx, when, freq, durationSec) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0, when);
    gain.gain.linearRampToValueAtTime(0.35, when + 0.02);
    gain.gain.linearRampToValueAtTime(0, when + durationSec);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(when);
    osc.stop(when + durationSec + 0.02);
  }

  function playAlarmPattern() {
    const ctx = getAudioCtx();
    if (ctx.state === "suspended") {
      ctx.resume().catch(() => {});
    }
    const now = ctx.currentTime;
    beep(ctx, now, 880, 0.18);
    beep(ctx, now + 0.24, 880, 0.18);
    beep(ctx, now + 0.48, 1046, 0.3);
  }

  function startAlarm() {
    alarmPlaying = true;
    unlockSoundBtn.hidden = true;

    let playedOnce = false;
    try {
      playAlarmPattern();
      playedOnce = true;
    } catch (e) {
      playedOnce = false;
    }

    // 自動再生がブロックされている可能性があるので、コンテキストの
    // 状態も見て、必要ならタップ用フォールバックボタンを出す。
    setTimeout(() => {
      if (!audioCtx || audioCtx.state === "suspended") {
        unlockSoundBtn.hidden = false;
      }
    }, 300);

    if (!playedOnce) {
      unlockSoundBtn.hidden = false;
    }

    clearInterval(alarmTimer);
    alarmTimer = setInterval(() => {
      if (!alarmPlaying) return;
      try {
        playAlarmPattern();
        unlockSoundBtn.hidden = true;
      } catch (e) {
        unlockSoundBtn.hidden = false;
      }
    }, 1500);
  }

  function stopAlarm() {
    alarmPlaying = false;
    unlockSoundBtn.hidden = true;
    clearInterval(alarmTimer);
    alarmTimer = null;
  }

  unlockSoundBtn.addEventListener("click", () => {
    getAudioCtx();
    tryResumeAudio();
    unlockSoundBtn.hidden = true;
    if (alarmPlaying) {
      try {
        playAlarmPattern();
      } catch (e) {
        /* noop */
      }
    }
  });

  // ==============================
  // iOS向け「ホーム画面に追加」案内
  // ==============================
  (function setupInstallHint() {
    const hintEl = document.getElementById("installHint");
    const closeBtn = document.getElementById("installHintClose");
    if (!hintEl || !closeBtn) return;

    const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent);
    const isStandalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      window.navigator.standalone === true;
    const dismissed = localStorage.getItem("noodleTimer.installHintDismissed") === "1";

    if (isIos && !isStandalone && !dismissed) {
      hintEl.hidden = false;
    }

    closeBtn.addEventListener("click", () => {
      hintEl.hidden = true;
      localStorage.setItem("noodleTimer.installHintDismissed", "1");
    });
  })();

  // ==============================
  // Service Worker登録 (PWAとしてインストール可能にする)
  // ==============================
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("sw.js").catch(() => {});
    });
  }

  render();
})();
