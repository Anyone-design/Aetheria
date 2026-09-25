/* ==========================================================================
   AETHERIA AUTH - LOGIC & MICRO-INTERACTIONS
   ========================================================================== */

document.addEventListener('DOMContentLoaded', () => {

  // --- Sound FX via Web Audio API (No external audio files needed) ---
  let soundEnabled = true;
  let audioCtx = null;

  function initAudio() {
    if (!audioCtx) {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      audioCtx = new AudioContext();
    }
    if (audioCtx.state === 'suspended') {
      audioCtx.resume();
    }
  }

  function getSpatialPan(target) {
    if (!target) return 0;
    let x = 0;
    if (typeof target.clientX === 'number') {
      x = target.clientX;
    } else if (target instanceof Element && typeof target.getBoundingClientRect === 'function') {
      const rect = target.getBoundingClientRect();
      x = rect.left + rect.width / 2;
    } else {
      return 0;
    }
    const width = window.innerWidth || 1920;
    const normalized = (x / width) * 2 - 1; // -1 (left) to +1 (right)
    return Math.max(-0.85, Math.min(0.85, normalized * 0.85));
  }

  function playTone(freq = 440, type = 'sine', duration = 0.08, gainVal = 0.04, panX = 0) {
    if (!soundEnabled) return;
    try {
      initAudio();
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
      gain.gain.setValueAtTime(gainVal, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + duration);

      if (typeof audioCtx.createStereoPanner === 'function' && panX !== 0) {
        const panner = audioCtx.createStereoPanner();
        panner.pan.setValueAtTime(Math.max(-1, Math.min(1, panX)), audioCtx.currentTime);
        osc.connect(gain);
        gain.connect(panner);
        panner.connect(audioCtx.destination);
      } else {
        osc.connect(gain);
        gain.connect(audioCtx.destination);
      }

      osc.start();
      osc.stop(audioCtx.currentTime + duration);
    } catch (e) {
      // Audio not supported or blocked
    }
  }

  let lastKeySoundTime = 0;
  function playKeyClickSound() {
    if (!soundEnabled) return;
    const now = performance.now();
    if (now - lastKeySoundTime < 40) return; // Debounce rapid typing to stay crisp
    lastKeySoundTime = now;
    try {
      initAudio();
      const freq = 640 + Math.random() * 140; // Micro pitch jitter for mechanical key feel
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
      gain.gain.setValueAtTime(0.014, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + 0.024);

      if (typeof audioCtx.createStereoPanner === 'function') {
        const panner = audioCtx.createStereoPanner();
        panner.pan.setValueAtTime(0.18, audioCtx.currentTime); // Subtle right bias toward scratchpad position
        osc.connect(gain);
        gain.connect(panner);
        panner.connect(audioCtx.destination);
      } else {
        osc.connect(gain);
        gain.connect(audioCtx.destination);
      }
      osc.start();
      osc.stop(audioCtx.currentTime + 0.024);
    } catch (e) {}
  }

  function playTabSound(isSignUp = false) {
    const pan = isSignUp ? 0.35 : -0.35;
    playTone(320, 'sine', 0.06, 0.03, pan);
    setTimeout(() => playTone(540, 'sine', 0.08, 0.03, pan), 40);
  }

  function playClickSound(target = null) {
    const pan = getSpatialPan(target);
    playTone(600, 'triangle', 0.04, 0.02, pan);
  }

  function playSuccessChord() {
    if (!soundEnabled) return;
    const notes = [523.25, 659.25, 783.99, 1046.50]; // C Major
    notes.forEach((freq, idx) => {
      setTimeout(() => {
        playTone(freq, 'sine', 0.25, 0.05);
      }, idx * 75);
    });
  }

  // Sound Toggle Button
  const soundToggle = document.getElementById('soundToggle');
  soundToggle.addEventListener('click', (e) => {
    initAudio();
    soundEnabled = !soundEnabled;
    soundToggle.classList.toggle('muted', !soundEnabled);
    soundToggle.querySelector('span').textContent = soundEnabled ? 'Audio FX: ON' : 'Audio FX: OFF';
    if (soundEnabled) playClickSound(e);
  });


  // --- 3D Mouse Tilt Effect (Hardware-Accelerated rAF Lerp) ---
  const wrapper = document.getElementById('cardContainer');
  let tiltTargetX = 0;
  let tiltTargetY = 0;
  let tiltCurrentX = 0;
  let tiltCurrentY = 0;
  let tiltRaf = null;

  function updateTilt() {
    tiltRaf = null;
    if (!wrapper || wrapper.classList.contains('hidden')) return;

    // Smooth lerp toward target
    tiltCurrentX += (tiltTargetX - tiltCurrentX) * 0.14;
    tiltCurrentY += (tiltTargetY - tiltCurrentY) * 0.14;

    wrapper.style.transform = `rotateY(${tiltCurrentX.toFixed(2)}deg) rotateX(${(-tiltCurrentY).toFixed(2)}deg)`;

    // Keep loop active until settled within threshold
    if (Math.abs(tiltTargetX - tiltCurrentX) > 0.02 || Math.abs(tiltTargetY - tiltCurrentY) > 0.02) {
      tiltRaf = requestAnimationFrame(updateTilt);
    }
  }

  document.addEventListener('mousemove', (e) => {
    if (!wrapper || wrapper.classList.contains('hidden') || window.innerWidth < 768) return;
    const middleX = window.innerWidth / 2;
    const middleY = window.innerHeight / 2;
    tiltTargetX = ((e.clientX - middleX) / middleX) * 10;
    tiltTargetY = ((e.clientY - middleY) / middleY) * 10;

    if (!tiltRaf) {
      tiltRaf = requestAnimationFrame(updateTilt);
    }
  }, { passive: true });

  // Reset tilt smoothly on mouse leave
  document.addEventListener('mouseleave', () => {
    tiltTargetX = 0;
    tiltTargetY = 0;
    if (!tiltRaf) {
      tiltRaf = requestAnimationFrame(updateTilt);
    }
  });


  // ==========================================================================
  // --- Cosmic Interactive Star Background Engine ---
  // ==========================================================================
  function initCosmicStarBackground() {
    const pCanvas = document.getElementById('particlesCanvas');
    const particleToggle = document.getElementById('particleToggle');

    if (!pCanvas) return;

    const pCtx = pCanvas.getContext('2d');

    // Persistence & State
    let fxEnabled = localStorage.getItem('aetheria_particles_fx') !== 'false';

    function updateToggleUI() {
      if (particleToggle) {
        particleToggle.classList.toggle('disabled', !fxEnabled);
        const span = particleToggle.querySelector('span');
        if (span) span.textContent = fxEnabled ? 'Stars: ON' : 'Stars: OFF';
      }
      pCanvas.classList.toggle('disabled', !fxEnabled);
    }
    updateToggleUI();

    if (particleToggle) {
      particleToggle.addEventListener('click', () => {
        fxEnabled = !fxEnabled;
        localStorage.setItem('aetheria_particles_fx', fxEnabled);
        updateToggleUI();
        playClickSound();
      });
    }

    // Dynamic Color Palette per Theme
    const THEME_PALETTES = {
      'neon-cyan': [
        { r: 6, g: 182, b: 212 },
        { r: 139, g: 92, b: 246 },
        { r: 236, g: 72, b: 153 },
        { r: 59, g: 130, b: 246 },
        { r: 241, g: 245, b: 249 }
      ],
      'matrix-emerald': [
        { r: 16, g: 185, b: 129 },
        { r: 52, g: 211, b: 153 },
        { r: 5, g: 150, b: 105 },
        { r: 110, g: 231, b: 183 },
        { r: 241, g: 245, b: 249 }
      ],
      'solar-amber': [
        { r: 245, g: 158, b: 11 },
        { r: 249, g: 115, b: 22 },
        { r: 239, g: 68, b: 68 },
        { r: 251, g: 191, b: 36 },
        { r: 241, g: 245, b: 249 }
      ],
      'deep-void': [
        { r: 168, g: 85, b: 247 },
        { r: 236, g: 72, b: 153 },
        { r: 124, g: 58, b: 237 },
        { r: 217, g: 70, b: 239 },
        { r: 241, g: 245, b: 249 }
      ]
    };

    let activeThemeId = localStorage.getItem('aetheria_theme') || 'neon-cyan';
    let currentPalette = THEME_PALETTES[activeThemeId] || THEME_PALETTES['neon-cyan'];

    window.setCosmicPalette = function(themeId) {
      if (THEME_PALETTES[themeId]) {
        currentPalette = THEME_PALETTES[themeId];
        particles.forEach(p => {
          p.color = currentPalette[Math.floor(Math.random() * currentPalette.length)];
        });
      }
    };

    let width = window.innerWidth;
    let height = window.innerHeight;
    let dpr = Math.min(window.devicePixelRatio || 1, 2);

    let particles = [];
    let shockwaves = [];
    let burstSparks = [];

    const mouse = {
      x: -1000,
      y: -1000,
      targetX: -1000,
      targetY: -1000,
      isActive: false
    };

    function resize() {
      width = window.innerWidth;
      height = window.innerHeight;
      dpr = Math.min(window.devicePixelRatio || 1, 2);

      pCanvas.width = width * dpr;
      pCanvas.height = height * dpr;
      pCanvas.style.width = width + 'px';
      pCanvas.style.height = height + 'px';
      pCtx.setTransform(dpr, 0, 0, dpr, 0, 0);

      initParticles();
    }


    function initParticles() {
      const count = Math.min(65, Math.max(35, Math.floor((width * height) / 22000)));
      particles = [];
      for (let i = 0; i < count; i++) {
        const color = currentPalette[Math.floor(Math.random() * currentPalette.length)];
        const vx = (Math.random() - 0.5) * 0.65;
        const vy = (Math.random() - 0.5) * 0.65;
        particles.push({
          x: Math.random() * width,
          y: Math.random() * height,
          vx,
          vy,
          baseVx: vx,
          baseVy: vy,
          radius: Math.random() * 1.5 + 1.2,
          color,
          baseAlpha: Math.random() * 0.45 + 0.35,
          pulseSpeed: Math.random() * 0.025 + 0.015,
          pulsePhase: Math.random() * Math.PI * 2
        });
      }
    }

    resize();
    window.addEventListener('resize', resize);

    // Audio chime for particle bursts with spatial panning
    function playSparkTone(x) {
      if (!soundEnabled) return;
      try {
        initAudio();
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(800, audioCtx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(1400, audioCtx.currentTime + 0.12);
        gain.gain.setValueAtTime(0.02, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + 0.12);

        const panX = typeof x === 'number' ? Math.max(-0.85, Math.min(0.85, ((x / (width || window.innerWidth || 1920)) * 2 - 1) * 0.85)) : 0;
        if (typeof audioCtx.createStereoPanner === 'function' && panX !== 0) {
          const panner = audioCtx.createStereoPanner();
          panner.pan.setValueAtTime(panX, audioCtx.currentTime);
          osc.connect(gain);
          gain.connect(panner);
          panner.connect(audioCtx.destination);
        } else {
          osc.connect(gain);
          gain.connect(audioCtx.destination);
        }

        osc.start();
        osc.stop(audioCtx.currentTime + 0.12);
      } catch (e) {}
    }

    // Trigger explosive shockwave and micro-sparks on click
    function triggerBurst(x, y) {
      if (!fxEnabled) return;

      shockwaves.push({
        x,
        y,
        radius: 4,
        maxRadius: Math.min(220, Math.max(140, width * 0.2)),
        alpha: 0.85,
        speed: 7
      });

      const sparkCount = 18;
      for (let i = 0; i < sparkCount; i++) {
        const angle = (Math.PI * 2 / sparkCount) * i + (Math.random() - 0.5) * 0.4;
        const speed = Math.random() * 5 + 2.5;
        const color = currentPalette[Math.floor(Math.random() * currentPalette.length)];
        burstSparks.push({
          x,
          y,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          size: Math.random() * 2.4 + 1.4,
          alpha: 1,
          decay: Math.random() * 0.025 + 0.018,
          color
        });
      }

      playSparkTone(x);
    }

    // Mouse Tracking for Star Reactivity & Liquid LERP Physics
    window.addEventListener('mousemove', (e) => {
      if (!mouse.isActive) {
        // Initial entry: snap directly so stars don't whip from off-screen
        mouse.x = e.clientX;
        mouse.y = e.clientY;
      }
      mouse.isActive = true;
      mouse.targetX = e.clientX;
      mouse.targetY = e.clientY;
    });

    window.addEventListener('mouseleave', () => {
      mouse.isActive = false;
      mouse.targetX = -1000;
      mouse.targetY = -1000;
    });

    // Mousedown Interactivity: Cosmic burst
    window.addEventListener('mousedown', (e) => {
      triggerBurst(e.clientX, e.clientY);
    });

    // Main Animation Loop
    function renderLoop() {
      requestAnimationFrame(renderLoop);

      // Conserve performance if tab hidden
      if (document.hidden) return;

      // Clear Canvas
      pCtx.clearRect(0, 0, width, height);

      if (!fxEnabled) return;

      // Liquid LERP interpolation for ultra-smooth starlight trailing
      if (mouse.isActive) {
        mouse.x += (mouse.targetX - mouse.x) * 0.12;
        mouse.y += (mouse.targetY - mouse.y) * 0.12;
      } else {
        mouse.x = -1000;
        mouse.y = -1000;
      }

      // Render Background Stars & Constellations
      const maxConnectDist = 115;
      const connectDistSq = maxConnectDist * maxConnectDist;
      const mouseRepelDist = 150;
      const mouseRepelSq = mouseRepelDist * mouseRepelDist;

      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];

        // Animate alpha pulse
        p.pulsePhase += p.pulseSpeed;
        const currentAlpha = p.baseAlpha + Math.sin(p.pulsePhase) * 0.18;

        // Mouse repulsion & starlight connection
        if (mouse.isActive) {
          const dx = p.x - mouse.x;
          const dy = p.y - mouse.y;
          const distSq = dx * dx + dy * dy;

          if (distSq < mouseRepelSq && distSq > 0.01) {
            const dist = Math.sqrt(distSq);
            const force = (1 - dist / mouseRepelDist) * 2.8;
            p.vx += (dx / dist) * force * 0.45;
            p.vy += (dy / dist) * force * 0.45;

            // Draw glowing starlight beam to cursor
            if (dist < 135) {
              const lineAlpha = (1 - dist / 135) * 0.35;
              pCtx.beginPath();
              pCtx.moveTo(p.x, p.y);
              pCtx.lineTo(mouse.x, mouse.y);
              pCtx.strokeStyle = `rgba(${p.color.r}, ${p.color.g}, ${p.color.b}, ${lineAlpha})`;
              pCtx.lineWidth = 0.9;
              pCtx.stroke();
            }
          }
        }

        // Return to natural drift velocity with damping
        p.vx += (p.baseVx - p.vx) * 0.04;
        p.vy += (p.baseVy - p.vy) * 0.04;

        // Position update
        p.x += p.vx;
        p.y += p.vy;

        // Boundary wrap
        if (p.x < -20) p.x = width + 20;
        if (p.x > width + 20) p.x = -20;
        if (p.y < -20) p.y = height + 20;
        if (p.y > height + 20) p.y = -20;

        // Draw crisp particle dot with aura exactly like earlier
        pCtx.beginPath();
        pCtx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
        pCtx.fillStyle = `rgba(${p.color.r}, ${p.color.g}, ${p.color.b}, ${currentAlpha})`;
        pCtx.shadowColor = `rgba(${p.color.r}, ${p.color.g}, ${p.color.b}, 0.8)`;
        pCtx.shadowBlur = 6;
        pCtx.fill();
        pCtx.shadowBlur = 0;

        // Constellation lines to neighbors with spatial bounding box check
        for (let j = i + 1; j < particles.length; j++) {
          const p2 = particles[j];
          const cdx = p.x - p2.x;
          if (cdx > maxConnectDist || cdx < -maxConnectDist) continue;
          const cdy = p.y - p2.y;
          if (cdy > maxConnectDist || cdy < -maxConnectDist) continue;
          const cdistSq = cdx * cdx + cdy * cdy;

          if (cdistSq < connectDistSq) {
            const dist = Math.sqrt(cdistSq);
            const lineAlpha = (1 - dist / maxConnectDist) * 0.16;
            pCtx.beginPath();
            pCtx.moveTo(p.x, p.y);
            pCtx.lineTo(p2.x, p2.y);
            pCtx.strokeStyle = `rgba(${p.color.r}, ${p.color.g}, ${p.color.b}, ${lineAlpha})`;
            pCtx.lineWidth = 0.75;
            pCtx.stroke();
          }
        }
      }

      // Render Shockwaves with double-ring neon halo (0 shadowBlur overhead)
      for (let s = shockwaves.length - 1; s >= 0; s--) {
        const sw = shockwaves[s];
        sw.radius += sw.speed;
        sw.alpha *= 0.94;

        // Push particles in shockwave wavefront
        for (let i = 0; i < particles.length; i++) {
          const p = particles[i];
          const dx = p.x - sw.x;
          const dy = p.y - sw.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (Math.abs(dist - sw.radius) < 26 && dist > 1) {
            const impulse = (1 - sw.radius / sw.maxRadius) * 5;
            p.vx += (dx / dist) * impulse;
            p.vy += (dy / dist) * impulse;
          }
        }

        const shockColor = currentPalette[0] || { r: 6, g: 182, b: 212 };
        
        // Outer diffuse halo
        pCtx.beginPath();
        pCtx.arc(sw.x, sw.y, sw.radius, 0, Math.PI * 2);
        pCtx.strokeStyle = `rgba(${shockColor.r}, ${shockColor.g}, ${shockColor.b}, ${sw.alpha * 0.38})`;
        pCtx.lineWidth = Math.max(2, 6 * (1 - sw.radius / sw.maxRadius));
        pCtx.stroke();

        // Inner crisp ring
        pCtx.beginPath();
        pCtx.arc(sw.x, sw.y, sw.radius, 0, Math.PI * 2);
        pCtx.strokeStyle = `rgba(255, 255, 255, ${sw.alpha * 0.9})`;
        pCtx.lineWidth = Math.max(1, 2 * (1 - sw.radius / sw.maxRadius));
        pCtx.stroke();

        if (sw.radius >= sw.maxRadius || sw.alpha <= 0.02) {
          shockwaves.splice(s, 1);
        }
      }

      // Render Burst Sparks with brilliant core + corona (0 shadowBlur overhead)
      for (let b = burstSparks.length - 1; b >= 0; b--) {
        const sp = burstSparks[b];
        sp.x += sp.vx;
        sp.y += sp.vy;
        sp.vx *= 0.95;
        sp.vy *= 0.95;
        sp.alpha -= sp.decay;

        if (sp.alpha <= 0) {
          burstSparks.splice(b, 1);
          continue;
        }

        // Outer soft glow
        pCtx.beginPath();
        pCtx.arc(sp.x, sp.y, sp.size * 1.8, 0, Math.PI * 2);
        pCtx.fillStyle = `rgba(${sp.color.r}, ${sp.color.g}, ${sp.color.b}, ${sp.alpha * 0.4})`;
        pCtx.fill();

        // Inner crisp white core
        pCtx.beginPath();
        pCtx.arc(sp.x, sp.y, sp.size * 0.75, 0, Math.PI * 2);
        pCtx.fillStyle = `rgba(255, 255, 255, ${sp.alpha * 0.95})`;
        pCtx.fill();
      }
    }

    requestAnimationFrame(renderLoop);
  }

  // Initialize Cosmic Star Background
  initCosmicStarBackground();

  // ==========================================================================
  // THEME CUSTOMIZER STUDIO ENGINE
  // ==========================================================================
  const THEMES = [
    { id: 'neon-cyan', label: 'Cyan', chord: [523.25, 659.25, 783.99] },       // C Maj
    { id: 'matrix-emerald', label: 'Emerald', chord: [440.00, 554.37, 659.25] }, // A Maj
    { id: 'solar-amber', label: 'Amber', chord: [392.00, 493.88, 587.33] },     // G Maj
    { id: 'deep-void', label: 'Void', chord: [349.23, 440.00, 523.25] }         // F Maj
  ];

  let currentThemeIndex = 0;
  const initialSavedTheme = localStorage.getItem('aetheria_theme') || 'neon-cyan';
  const foundIdx = THEMES.findIndex(t => t.id === initialSavedTheme);
  if (foundIdx !== -1) currentThemeIndex = foundIdx;

  function applyTheme(themeId, playFeedback = false, feedbackTarget = null) {
    const themeObj = THEMES.find(t => t.id === themeId) || THEMES[0];
    document.documentElement.setAttribute('data-theme', themeObj.id);
    localStorage.setItem('aetheria_theme', themeObj.id);
    syncThemeBackend(themeObj.id);

    // Update Quick Toggle Button
    const themeToggleLabel = document.getElementById('themeToggleLabel');
    if (themeToggleLabel) {
      themeToggleLabel.textContent = `Theme: ${themeObj.label}`;
    }

    // Update Theme Studio Selector Chips
    document.querySelectorAll('.theme-chip').forEach(chip => {
      chip.classList.toggle('active', chip.getAttribute('data-theme') === themeObj.id);
    });

    // Update Cosmic Canvas particles
    if (typeof window.setCosmicPalette === 'function') {
      window.setCosmicPalette(themeObj.id);
    }

    // Play cyber acoustic chime for the theme with spatial panning
    if (playFeedback && soundEnabled) {
      const pan = getSpatialPan(feedbackTarget);
      themeObj.chord.forEach((freq, i) => {
        setTimeout(() => playTone(freq, 'sine', 0.12, 0.03, pan), i * 60);
      });
    }
  }

  // Quick Cycle Button in Top Controls
  const themeToggle = document.getElementById('themeToggle');
  if (themeToggle) {
    themeToggle.addEventListener('click', (e) => {
      currentThemeIndex = (currentThemeIndex + 1) % THEMES.length;
      applyTheme(THEMES[currentThemeIndex].id, true, e);
    });
  }

  // Cyber Theme Studio Selector Chips in Side Panel
  document.querySelectorAll('.theme-chip').forEach(chip => {
    chip.addEventListener('click', (e) => {
      const themeId = chip.getAttribute('data-theme');
      const idx = THEMES.findIndex(t => t.id === themeId);
      if (idx !== -1) currentThemeIndex = idx;
      applyTheme(themeId, true, chip);
    });
  });

  // Apply saved theme on boot
  applyTheme(THEMES[currentThemeIndex].id, false);


  // --- Tab Switching Logic with Stereo Panning ---
  const tabSignIn = document.getElementById('tabSignIn');
  const tabSignUp = document.getElementById('tabSignUp');
  const tabIndicator = document.getElementById('tabIndicator');
  const signInForm = document.getElementById('signInForm');
  const signUpForm = document.getElementById('signUpForm');

  function switchTab(target) {
    playTabSound(target === 'signup');
    if (target === 'signin') {
      tabSignIn.classList.add('active');
      tabSignUp.classList.remove('active');
      tabIndicator.style.transform = 'translateX(0%)';
      signUpForm.classList.remove('active-form');
      setTimeout(() => {
        signInForm.classList.add('active-form');
      }, 150);
    } else {
      tabSignUp.classList.add('active');
      tabSignIn.classList.remove('active');
      tabIndicator.style.transform = 'translateX(100%)';
      signInForm.classList.remove('active-form');
      setTimeout(() => {
        signUpForm.classList.add('active-form');
      }, 150);
    }
  }

  tabSignIn.addEventListener('click', () => switchTab('signin'));
  tabSignUp.addEventListener('click', () => switchTab('signup'));


  // --- Password View Toggle ---
  document.querySelectorAll('.password-toggle').forEach(btn => {
    btn.addEventListener('click', (e) => {
      playClickSound(btn);
      const targetId = btn.getAttribute('data-target');
      const input = document.getElementById(targetId);
      const eyeOpen = btn.querySelector('.eye-open');
      const eyeClosed = btn.querySelector('.eye-closed');

      if (input.type === 'password') {
        input.type = 'text';
        eyeOpen.classList.add('hidden');
        eyeClosed.classList.remove('hidden');
      } else {
        input.type = 'password';
        eyeOpen.classList.remove('hidden');
        eyeClosed.classList.add('hidden');
      }
    });
  });


  // --- Real-time Password Strength Meter ---
  const signupPass = document.getElementById('signupPass');
  const passStrengthFill = document.getElementById('passStrengthFill');
  const passStrengthText = document.getElementById('passStrengthText');

  if (signupPass) {
    signupPass.addEventListener('input', () => {
      const val = signupPass.value;
      let score = 0;
      if (val.length >= 6) score += 25;
      if (val.length >= 10) score += 25;
      if (/[A-Z]/.test(val) && /[a-z]/.test(val)) score += 25;
      if (/[0-9]/.test(val) || /[^A-Za-z0-9]/.test(val)) score += 25;

      passStrengthFill.style.width = score + '%';

      if (score === 0) {
        passStrengthText.textContent = 'Password Security';
        passStrengthText.style.color = 'var(--text-muted)';
      } else if (score <= 25) {
        passStrengthFill.style.backgroundColor = '#ef4444'; // Red
        passStrengthText.textContent = 'Security: Vulnerable';
        passStrengthText.style.color = '#ef4444';
      } else if (score <= 50) {
        passStrengthFill.style.backgroundColor = '#f59e0b'; // Amber
        passStrengthText.textContent = 'Security: Moderate';
        passStrengthText.style.color = '#f59e0b';
      } else if (score <= 75) {
        passStrengthFill.style.backgroundColor = '#3b82f6'; // Blue
        passStrengthText.textContent = 'Security: Strong';
        passStrengthText.style.color = '#3b82f6';
      } else {
        passStrengthFill.style.backgroundColor = '#10b981'; // Emerald
        passStrengthText.textContent = 'Security: Unbreakable';
        passStrengthText.style.color = '#10b981';
      }
    });
  }


  // --- Particle / Confetti Burst on Success ---
  function spawnParticles(x, y) {
    const colors = ['#06b6d4', '#3b82f6', '#8b5cf6', '#10b981', '#ffffff'];
    const particleCount = 24;

    for (let i = 0; i < particleCount; i++) {
      const particle = document.createElement('div');
      particle.className = 'confetti-particle';
      const size = Math.random() * 6 + 4;
      particle.style.width = `${size}px`;
      particle.style.height = `${size}px`;
      particle.style.background = colors[Math.floor(Math.random() * colors.length)];
      particle.style.left = `${x}px`;
      particle.style.top = `${y}px`;

      document.body.appendChild(particle);

      const angle = Math.random() * Math.PI * 2;
      const velocity = Math.random() * 90 + 40;
      const destX = Math.cos(angle) * velocity;
      const destY = Math.sin(angle) * velocity;

      particle.animate([
        { transform: 'translate(0, 0) scale(1)', opacity: 1 },
        { transform: `translate(${destX}px, ${destY}px) scale(0)`, opacity: 0 }
      ], {
        duration: 700 + Math.random() * 300,
        easing: 'cubic-bezier(0.16, 1, 0.3, 1)',
        fill: 'forwards'
      }).onfinish = () => particle.remove();
    }
  }


  // --- Form Submission Handling with Real Backend REST API & Animation Pipeline ---
  async function handleAuthSubmit(btn, form, isRegister = false) {
    const errorId = isRegister ? 'signUpError' : 'signInError';
    const errorEl = document.getElementById(errorId);
    if (errorEl) {
      errorEl.textContent = '';
      errorEl.classList.remove('visible');
    }

    const emailInput = isRegister ? document.getElementById('signupEmail') : document.getElementById('loginEmail');
    const passInput = isRegister ? document.getElementById('signupPass') : document.getElementById('loginPass');
    const nameInput = document.getElementById('signupName');

    const email = emailInput ? emailInput.value.trim() : '';
    const password = passInput ? passInput.value : '';
    const name = (isRegister && nameInput) ? nameInput.value.trim() : '';

    btn.classList.add('loading');
    playTone(400, 'sine', 0.15, 0.03);

    try {
      const endpoint = isRegister ? '/api/auth/register' : '/api/auth/login';
      const payload = isRegister ? { name, email, password } : { email, password };

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();

      if (!res.ok) {
        btn.classList.remove('loading');
        playTone(220, 'sawtooth', 0.2, 0.04);
        if (errorEl) {
          errorEl.textContent = data.error || 'Authentication failed.';
          errorEl.classList.add('visible');
        }
        form.classList.add('shake');
        setTimeout(() => form.classList.remove('shake'), 400);
        return;
      }

      // Successful Auth: Save Token & User profile
      localStorage.setItem('aetheria_token', data.token);
      localStorage.setItem('aetheria_user', JSON.stringify(data.user));

      btn.classList.remove('loading');
      btn.classList.add('success');
      playSuccessChord();

      const rect = btn.getBoundingClientRect();
      spawnParticles(rect.left + rect.width / 2, rect.top + rect.height / 2);

      if (data.user && data.user.theme) {
        applyTheme(data.user.theme, false);
      }

      setTimeout(() => {
        wrapper.classList.add('exit-anim');
        setTimeout(() => {
          wrapper.classList.add('hidden');
          wrapper.classList.remove('exit-anim');
          btn.classList.remove('success');
          form.reset();
          if (errorEl) {
            errorEl.textContent = '';
            errorEl.classList.remove('visible');
          }
          if (passStrengthFill) {
            passStrengthFill.style.width = '0%';
            passStrengthText.textContent = 'Password Security';
            passStrengthText.style.color = 'var(--text-muted)';
          }
          openDashboard(data.user.name || 'Commander');
        }, 500);
      }, 900);

    } catch (err) {
      btn.classList.remove('loading');
      playTone(220, 'sawtooth', 0.2, 0.04);
      if (errorEl) {
        errorEl.textContent = 'Unable to connect to local backend server.';
        errorEl.classList.add('visible');
      }
    }
  }

  const submitLogin = document.getElementById('submitLogin');
  if (submitLogin) {
    submitLogin.addEventListener('click', (e) => {
      e.preventDefault();
      if (signInForm.checkValidity()) {
        handleAuthSubmit(submitLogin, signInForm, false);
      } else {
        signInForm.reportValidity();
      }
    });
  }

  const submitRegister = document.getElementById('submitRegister');
  if (submitRegister) {
    submitRegister.addEventListener('click', (e) => {
      e.preventDefault();
      if (signUpForm.checkValidity()) {
        handleAuthSubmit(submitRegister, signUpForm, true);
      } else {
        signUpForm.reportValidity();
      }
    });
  }


  // ==========================================================================
  // DASHBOARD MANAGEMENT & LOGIC
  // ==========================================================================
  const dashWrapper = document.getElementById('dashboardWrapper');
  const dashUserName = document.getElementById('dashUserName');
  const dynamicGreeting = document.getElementById('dynamicGreeting');
  const liveClock = document.getElementById('liveClock');
  const liveDate = document.getElementById('liveDate');
  const logoutBtn = document.getElementById('logoutBtn');
  const topControlsBar = document.getElementById('topControlsBar');
  const dashControlsSlot = document.getElementById('dashControlsSlot');
  const cardContainer = document.getElementById('cardContainer');

  let clockTimer = null;

  function updateClock() {
    const now = new Date();
    const hrs = String(now.getHours()).padStart(2, '0');
    const mins = String(now.getMinutes()).padStart(2, '0');
    const secs = String(now.getSeconds()).padStart(2, '0');
    if (liveClock) liveClock.textContent = `${hrs}:${mins}:${secs}`;

    const options = { weekday: 'long', month: 'short', day: 'numeric', year: 'numeric' };
    if (liveDate) liveDate.textContent = now.toLocaleDateString('en-US', options);

    // Dynamic Greeting
    const hour = now.getHours();
    let timeGreeting = 'Good evening';
    if (hour < 12) timeGreeting = 'Good morning';
    else if (hour < 17) timeGreeting = 'Good afternoon';

    const currentUser = dashUserName ? dashUserName.textContent : 'Commander';
    if (dynamicGreeting) dynamicGreeting.textContent = `${timeGreeting}, ${currentUser}.`;
  }

  function openDashboard(userName) {
    if (dashUserName) dashUserName.textContent = userName;
    document.body.classList.add('in-dashboard');
    if (topControlsBar && dashControlsSlot) {
      dashControlsSlot.appendChild(topControlsBar);
    }
    dashWrapper.classList.remove('hidden');
    updateClock();
    if (!clockTimer) {
      clockTimer = setInterval(updateClock, 1000);
    }
    initMissions();
    initScratchpad();
    shuffleWisdom();
  }

  // Logout Handler
  if (logoutBtn) {
    logoutBtn.addEventListener('click', () => {
      playTone(260, 'sine', 0.1, 0.03);
      localStorage.removeItem('aetheria_token');
      localStorage.removeItem('aetheria_user');
      closeSidePanel();
      document.body.classList.remove('in-dashboard');
      if (topControlsBar && cardContainer) {
        document.body.insertBefore(topControlsBar, cardContainer);
      }
      dashWrapper.classList.add('hidden');
      wrapper.classList.remove('hidden');
      wrapper.style.transform = 'rotateY(0deg) rotateX(0deg)';
      if (clockTimer) {
        clearInterval(clockTimer);
        clockTimer = null;
      }
    });
  }

  // --- Side Panel Navigation Menu ("Updates in future") ---
  const menuToggleBtn = document.getElementById('menuToggleBtn');
  const sidePanel = document.getElementById('sidePanel');
  const sidePanelOverlay = document.getElementById('sidePanelOverlay');
  const closeSidePanelBtn = document.getElementById('closeSidePanelBtn');

  function openSidePanel() {
    if (!sidePanel || !sidePanelOverlay) return;
    playTone(520, 'sine', 0.05, 0.02);
    sidePanel.classList.add('open');
    sidePanelOverlay.classList.add('open');
  }

  function closeSidePanel() {
    if (!sidePanel || !sidePanelOverlay) return;
    playTone(400, 'sine', 0.05, 0.02);
    sidePanel.classList.remove('open');
    sidePanelOverlay.classList.remove('open');
  }

  if (menuToggleBtn) {
    menuToggleBtn.addEventListener('click', openSidePanel);
  }
  if (closeSidePanelBtn) {
    closeSidePanelBtn.addEventListener('click', closeSidePanel);
  }
  if (sidePanelOverlay) {
    sidePanelOverlay.addEventListener('click', closeSidePanel);
  }
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && sidePanel && sidePanel.classList.contains('open')) {
      closeSidePanel();
    }
  });


  // --- Widget 1: Focus Missions (Database-Synced) ---
  const newMissionForm = document.getElementById('newMissionForm');
  const missionInput = document.getElementById('missionInput');
  const missionList = document.getElementById('missionList');
  const missionCountBadge = document.getElementById('missionCountBadge');

  let missions = [];

  async function loadMissions() {
    const token = localStorage.getItem('aetheria_token');
    if (!token) return;
    try {
      const res = await fetch('/api/missions', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        missions = data.missions || [];
        renderMissions();
      }
    } catch (e) {
      console.warn('Offline / fallback missions');
    }
  }

  function renderMissions() {
    if (!missionList) return;
    missionList.innerHTML = '';
    const completedCount = missions.filter(m => m.done).length;
    if (missionCountBadge) {
      missionCountBadge.textContent = `${completedCount} / ${missions.length}`;
    }

    missions.forEach(mission => {
      const li = document.createElement('li');
      li.className = `mission-item ${mission.done ? 'completed' : ''}`;
      li.innerHTML = `
        <label>
          <input type="checkbox" ${mission.done ? 'checked' : ''} data-id="${mission.id}">
          <span>${escapeHtml(mission.text)}</span>
        </label>
        <button class="mission-del-btn" data-id="${mission.id}" title="Remove mission">✕</button>
      `;
      missionList.appendChild(li);
    });

    // Checkbox Events with smooth progressive completion (no jarring DOM redraw)
    missionList.querySelectorAll('input[type="checkbox"]').forEach(chk => {
      chk.addEventListener('change', async (e) => {
        playTone(520, 'triangle', 0.05, 0.02, getSpatialPan(e.target));
        const id = Number(e.target.getAttribute('data-id'));
        const target = missions.find(m => m.id === id);
        if (target) {
          target.done = e.target.checked;
          const li = e.target.closest('.mission-item');
          if (li) {
            li.classList.toggle('completed', target.done);
          }
          const completedCount = missions.filter(m => m.done).length;
          if (missionCountBadge) {
            missionCountBadge.textContent = `${completedCount} / ${missions.length}`;
          }
          const token = localStorage.getItem('aetheria_token');
          if (token) {
            try {
              await fetch(`/api/missions/${id}`, {
                method: 'PATCH',
                headers: {
                  'Content-Type': 'application/json',
                  'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ done: target.done })
              });
            } catch (err) {}
          }
        }
      });
    });

    // Delete Events with smooth slide-out and dissolve
    missionList.querySelectorAll('.mission-del-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        playClickSound(btn);
        const id = Number(btn.getAttribute('data-id'));
        const li = btn.closest('.mission-item');
        if (li) {
          li.style.transition = 'all 0.22s cubic-bezier(0.4, 0, 0.2, 1)';
          li.style.opacity = '0';
          li.style.transform = 'translateX(24px) scale(0.9)';
          setTimeout(() => {
            missions = missions.filter(m => m.id !== id);
            renderMissions();
          }, 200);
        } else {
          missions = missions.filter(m => m.id !== id);
          renderMissions();
        }
        const token = localStorage.getItem('aetheria_token');
        if (token) {
          try {
            await fetch(`/api/missions/${id}`, {
              method: 'DELETE',
              headers: { 'Authorization': `Bearer ${token}` }
            });
          } catch (err) {}
        }
      });
    });
  }

  function initMissions() {
    loadMissions();
    if (newMissionForm) {
      newMissionForm.onsubmit = async (e) => {
        e.preventDefault();
        const val = missionInput.value.trim();
        if (!val) return;
        playTone(680, 'sine', 0.06, 0.03, getSpatialPan(newMissionForm));
        missionInput.value = '';

        const token = localStorage.getItem('aetheria_token');
        if (token) {
          try {
            const res = await fetch('/api/missions', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
              },
              body: JSON.stringify({ text: val })
            });
            if (res.ok) {
              const data = await res.json();
              missions.unshift(data.mission);
              renderMissions();
              return;
            }
          } catch (err) {}
        }

        // Fallback if offline
        missions.unshift({ id: Date.now(), text: val, done: false });
        renderMissions();
      };
    }
  }

  function escapeHtml(str) {
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }


  // --- Widget 2: Neural Scratchpad (Database-Synced) ---
  const scratchpadArea = document.getElementById('scratchpadArea');
  const scratchpadStatus = document.getElementById('scratchpadStatus');
  const charCount = document.getElementById('charCount');
  const clearNotesBtn = document.getElementById('clearNotesBtn');
  let saveDebounceTimer = null;

  async function loadScratchpad() {
    const token = localStorage.getItem('aetheria_token');
    if (!token || !scratchpadArea) return;
    try {
      const res = await fetch('/api/scratchpad', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        scratchpadArea.value = data.content || '';
        updateScratchFooter();
        if (scratchpadStatus) scratchpadStatus.textContent = 'Saved to DB ✓';
      }
    } catch (e) {}
  }

  function initScratchpad() {
    if (!scratchpadArea) return;
    loadScratchpad();

    scratchpadArea.addEventListener('input', () => {
      playKeyClickSound();
      updateScratchFooter();
      if (scratchpadStatus) scratchpadStatus.textContent = 'Syncing...';
      clearTimeout(saveDebounceTimer);
      saveDebounceTimer = setTimeout(async () => {
        const token = localStorage.getItem('aetheria_token');
        if (token) {
          try {
            await fetch('/api/scratchpad', {
              method: 'PUT',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
              },
              body: JSON.stringify({ content: scratchpadArea.value })
            });
            if (scratchpadStatus) scratchpadStatus.textContent = 'Saved to DB ✓';
          } catch (e) {
            if (scratchpadStatus) scratchpadStatus.textContent = 'Saved locally';
          }
        }
      }, 400);
    });

    if (clearNotesBtn) {
      clearNotesBtn.addEventListener('click', async (e) => {
        playClickSound(clearNotesBtn);
        scratchpadArea.value = '';
        updateScratchFooter();
        const token = localStorage.getItem('aetheria_token');
        if (token) {
          try {
            await fetch('/api/scratchpad', {
              method: 'PUT',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
              },
              body: JSON.stringify({ content: '' })
            });
          } catch (e) {}
        }
        if (scratchpadStatus) scratchpadStatus.textContent = 'Cleared';
      });
    }
  }

  function updateScratchFooter() {
    if (!scratchpadArea || !charCount) return;
    const len = scratchpadArea.value.length;
    charCount.textContent = `${len} character${len === 1 ? '' : 's'}`;
  }


  // --- Widget 3: Daily Builder Wisdom ---
  const wisdomQuotes = [
    { text: "The best way to predict the future is to invent it.", author: "Alan Kay" },
    { text: "Simplicity is prerequisite for reliability.", author: "Edsger W. Dijkstra" },
    { text: "You don't need a huge team. You need high agency and clear execution.", author: "Naval Ravikant" },
    { text: "Make it work, make it right, make it fast.", author: "Kent Beck" },
    { text: "Stay hungry, stay foolish.", author: "Steve Jobs" },
    { text: "The secret to getting ahead is getting started.", author: "Mark Twain" },
    { text: "Code is like humor. When you have to explain it, it’s bad.", author: "Cory House" },
    { text: "Talk is cheap. Show me the code.", author: "Linus Torvalds" },
    { text: "Focus is a matter of deciding what things you're not going to do.", author: "John Carmack" },
    { text: "What I cannot create, I do not understand.", author: "Richard Feynman" },
    { text: "The Analytical Engine weaves algebraic patterns just as the loom weaves flowers.", author: "Ada Lovelace" },
    { text: "The most dangerous phrase is: 'We've always done it this way.'", author: "Grace Hopper" },
    { text: "Make something people want.", author: "Paul Graham" },
    { text: "Never trust a computer you can't throw out a window.", author: "Steve Wozniak" },
    { text: "Premature optimization is the root of all evil.", author: "Donald Knuth" },
    { text: "There are only two kinds of languages: the ones people complain about and the ones nobody uses.", author: "Bjarne Stroustrup" },
    { text: "Any fool can write code that a computer understands. Good programmers write code humans understand.", author: "Martin Fowler" },
    { text: "Sometimes people no one imagines anything of do the things that no one can imagine.", author: "Alan Turing" },
    { text: "The soul becomes dyed with the color of its thoughts.", author: "Marcus Aurelius" },
    { text: "Perfection is achieved not when there is nothing to add, but nothing left to take away.", author: "Antoine de Saint-Exupéry" },
    { text: "The present is theirs; the future, for which I really worked, is mine.", author: "Nikola Tesla" },
    { text: "Art is never finished, only abandoned.", author: "Leonardo da Vinci" },
    { text: "Information is the resolution of uncertainty.", author: "Claude Shannon" },
    { text: "The better you get at getting better, the faster you get better.", author: "Douglas Engelbart" },
    { text: "Work hard, have fun, make history.", author: "Jeff Bezos" },
    { text: "If you don't believe it or don't get it, I don't have the time to try to convince you, sorry.", author: "Satoshi Nakamoto" },
    { text: "Controlling complexity is the essence of computer programming.", author: "Brian Kernighan" },
    { text: "Good judgment is the result of experience and experience the result of bad judgment.", author: "Fred Brooks" },
    { text: "You cannot trust code that you did not totally create yourself.", author: "Ken Thompson" },
    { text: "You do not rise to the level of your goals. You fall to the level of your systems.", author: "James Clear" },
    { text: "First principles thinking is the art of boiling things down to their fundamental truths.", author: "Aristotle" },
    { text: "The function of good software is to make the complex appear simple.", author: "Grady Booch" }
  ];

  const quoteText = document.getElementById('quoteText');
  const quoteAuthor = document.getElementById('quoteAuthor');
  const shuffleQuoteBtn = document.getElementById('shuffleQuoteBtn');

  function shuffleWisdom() {
    if (!quoteText || !quoteAuthor) return;
    const item = wisdomQuotes[Math.floor(Math.random() * wisdomQuotes.length)];
    quoteText.style.opacity = '0';
    quoteAuthor.style.opacity = '0';
    setTimeout(() => {
      quoteText.textContent = `"${item.text}"`;
      quoteAuthor.textContent = `— ${item.author}`;
      quoteText.style.opacity = '1';
      quoteAuthor.style.opacity = '1';
    }, 200);
  }

  if (shuffleQuoteBtn) {
    shuffleQuoteBtn.addEventListener('click', (e) => {
      playClickSound(shuffleQuoteBtn);
      shuffleWisdom();
    });
  }

  // --- Backend Session Restore & Helper ---
  async function syncThemeBackend(themeId) {
    const token = localStorage.getItem('aetheria_token');
    if (!token) return;
    try {
      await fetch('/api/auth/theme', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ theme: themeId })
      });
    } catch (e) {}
  }

  // Auto-login on boot if valid session token exists in browser
  async function checkExistingSession() {
    const token = localStorage.getItem('aetheria_token');
    if (!token) return;
    try {
      const res = await fetch('/api/auth/me', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const { user } = await res.json();
        if (user) {
          wrapper.classList.add('hidden');
          if (user.theme) {
            applyTheme(user.theme, false);
          }
          openDashboard(user.name || 'Commander');
        }
      } else {
        localStorage.removeItem('aetheria_token');
        localStorage.removeItem('aetheria_user');
      }
    } catch (e) {
      // Server offline or starting
    }
  }

  checkExistingSession();
});
