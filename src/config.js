// Game design config. Every tunable value of the game lives here.
// Units: distances in world units (1 unit = 1 box by default), time in seconds, speeds in units/second.

export const CONFIG = {
  render: {
    background: "#272c33",
    antialias: true,
    maxPixelRatio: 2,
    shadows: true,
    shadowMapSize: 1024,
    exposure: 1.0,
  },

  camera: {
    fov: 50,
    position: [0, 12.5, 15.5],
    lookAt: [0, 0, -0.3],
    // On screens narrower than this aspect (w/h), the fov widens so the board width always fits.
    referenceAspect: 0.72,
    shakeDecay: 6,
  },

  lights: {
    ambient: { color: "#ffffff", intensity: 0.55 },
    hemisphere: { sky: "#bcd0ff", ground: "#3a2a4a", intensity: 0.6 },
    directional: { color: "#ffffff", intensity: 1.6, position: [4, 14, 8] },
  },

  board: {
    width: 6, // inner width of the lane
    backZ: -9, // far end
    frontZ: 9, // near end
    lineZ: 3.6, // red "game over" line
    floor: {
      // gradient from back -> middle -> front
      colors: ["#2d3fa8", "#3a2560", "#3e3a3c"],
      roughness: 0.75,
      metalness: 0.0,
    },
    walls: {
      height: 0.75,
      thickness: 0.5,
      color: "#7440d8",
      frontColor: "#6a4fe0",
      roughness: 0.35,
      metalness: 0.15,
      cornerRadius: 0.18,
    },
    base: { color: "#4a2c94", depth: 0.6 },
    line: { color: "#ff1010", width: 0.4, opacity: 0.95 },
    // Extra static walls that shape the level. Each: { x, z, width, depth, height, color? }
    // Example: { x: 0, z: -2, width: 1.2, depth: 0.4, height: 0.75 }
    obstacles: [],
  },

  // The red wall at the back that periodically pushes all boxes towards the player.
  pusher: {
    enabled: true,
    color: "#d40f0f",
    warnColor: "#ff5a3a",
    height: 0.9,
    thickness: 0.5,
    trigger: "time", // 'throws' | 'time'
    everyThrows: 4, // used when trigger is 'throws'
    everySeconds: 8, // starting seconds between pushes
    minEverySeconds: 4, // floor — never pushes more often than this
    // every this many seconds of play, the interval drops by 1s (down to minEverySeconds)
    secondsPerIntervalStep: 35,
    delayAfterThrow: 1.0, // wait for the thrown box to settle before pushing (throws trigger)
    warnDuration: 1.4, // blinking before the push
    distance: 1.6, // how far it pushes forward
    pushDuration: 1.1,
    holdDuration: 0.25,
    returnDuration: 0.9,
    // new boxes dropped in at the back once the pusher has retracted
    spawnBoxes: {
      enabled: true,
      xPositions: [-2.1, -0.7, 0.7, 2.1], // one box per entry
      z: -8.35,
      dropHeight: 1.2, // boxes fall in from this height above the floor
      stagger: 0.08, // delay between each box appearing
    },
  },

  physics: {
    gravity: -28,
    fixedTimeStep: 1 / 60,
    maxSubSteps: 4,
    solverIterations: 12,
    boxMass: 1,
    maxSpeed: 30, // safety clamp so crushed boxes never get launched out of the level
    // boxes resting on the board (higher = they stop sooner after being hit / pushed)
    linearDamping: 0.3,
    angularDamping: 0.5,
    angularFactor: [1, 1, 1], // set to [0, 1, 0] to stop boxes from tipping over
    // a thrown box glides frictionless and straight, with rotation locked, until it hits another box
    thrownLinearDamping: 0.04,
    friction: { boxFloor: 0.5, boxBox: 0.1, boxWall: 0.05 },
    restitution: { boxFloor: 0.01, boxBox: 0.01, boxWall: 0.01 },
  },

  box: {
    size: 1,
    cornerRadius: 0.09,
    roughness: 0.42,
    metalness: 0.05,
    textureSize: 256,
    textColor: "#ffffff",
    textShadow: "rgba(0,0,0,0.35)",
    fontFamily: '"Arial Rounded MT Bold", "Trebuchet MS", Arial, sans-serif',
    borderLighten: 0.18, // light inner border strength on box faces
    colors: {
      2: "#1f9a3a",
      4: "#7b30d6",
      8: "#f0820f",
      16: "#36c3c9",
      32: "#e8364f",
      64: "#2f6be0",
      128: "#e6c11c",
      256: "#d63ab8",
      512: "#18a88c",
      1024: "#ff6a2a",
      2048: "#ffd700",
      4096: "#7cff4a",
      8192: "#ff4ad2",
      16384: "#4a9fff",
      32768: "#ff9f4a",
      65536: "#c0ff4a",
    },
    // used for values above the highest defined in `colors`
    fallbackColors: ["#a0522d", "#4b0082", "#008b8b", "#b22222", "#556b2f"],
  },

  throw: {
    speed: 26,
    spawnDelay: 0.45, // delay before the next box appears after a throw
    spawnZ: 6.3,
    spawnAnimDuration: 0.22,
    edgeMargin: 0.05, // keeps held box away from the side walls
    keyboardSpeed: 8, // arrows / A,D movement speed on desktop
    aimLine: { enabled: true, color: "#ffffff", opacity: 0.45, width: 0.22 },
  },

  merge: {
    // two boxes merge if they are in physical contact, or their centers are closer than size * this
    touchDistanceFactor: 1.04,
    jumpVelocity: 4.5,
    seekStrength: 0.75, // 0..1 how far towards the closest same-value box it travels
    seekMaxDistance: 5, // ignore same-value boxes further than this
    spin: 5,
    cooldown: 0.06,
    popScale: 1.25,
    popDuration: 0.25,
    particles: 14,
    particleSpeed: 4.5,
  },

  particles: {
    max: 600,
    size: 0.13,
    life: 0.7,
    gravity: -16,
  },

  spawn: {
    initialZ: -7.6,
    initialBoxes: [
      { value: 2, x: -1.8 },
      { value: 4, x: 0 },
      { value: 8, x: 1.8 },
    ],
    // New boxes pick a value ≤ board max (any power of 2 in range), never above maxSpawnValue.
    maxSpawnValue: 256,
    smallBias: 0.6, // 0..1, lower = strongly prefer small values
    fallbackPool: [2, 4],
  },

  gameOver: {
    graceTime: 0.01, // a box must stay across the line this long to end the game
    stallSpeed: 0.3, // a thrown box slower than this that never crossed the line...
    stallTime: 0.8, // ...for this long ends the game
  },

  score: {
    storageKey: "qube2048.best",
  },

  // Global top-100 leaderboard backed by Supabase (run supabase/schema.sql in your project first).
  // Project Settings -> API: paste the project URL and the anon / publishable key (both are safe to ship).
  // Left empty, `npm run dev` uses a fake leaderboard and production builds show it as unavailable.
  leaderboard: {
    supabaseUrl: "https://vwcfsycpwzglwkkzojoo.supabase.co",
    supabaseAnonKey: "sb_publishable__j_r13lwYdoVozHv30G9cg_3UXUuWye",
    size: 100,
    timeoutMs: 8000,
  },

  crazygames: {
    // Official CrazyGames leaderboard (invite-only). Paste the Encryption Key from the Developer Portal to enable.
    leaderboardEncryptionKey: "",
  },

  boosters: {
    firstThreshold: 80, // points needed for the first booster
    thresholdGrowth: 2, // each next booster needs this many times more points
    weights: { bomb: 1, wild: 1, glove: 1 }, // set to 0 to disable a booster
    // progress bar drains while the player is not throwing
    idleGrace: 2.5, // seconds of inactivity before decay starts
    idleDecayPerSecond: 12, // points lost per second once idle

    bomb: {
      radius: 2.1,
      color: "#c81e1e",
      bandColor: "#5a0d0d",
      labelColor: "#f2f2f2",
      textColor: "#111111",
      text: "TNT",
      stopSpeed: 0.7, // explodes once slower than this
      minFuse: 0.35,
      maxFuse: 3,
      blastImpulse: 9, // impulse applied to boxes just outside the radius
      blastFalloffRadius: 2.2, // multiplier of radius for the impulse zone
      particles: 60,
      shake: 0.45,
      flashColor: "#ffb347",
    },

    wild: {
      cycleInterval: 0.1,
      gradient: ["#ff3b3b", "#ffb21f", "#f4f12a", "#36d655", "#2ab8ff", "#a347ff"],
      emissiveIntensity: 0.25,
      hueSpeed: 0.6,
    },

    glove: {
      speed: 16,
      background: "#ffe9d6",
      imageScale: 0.86,
      scale: [1.1, 1, 1.1],
      hitParticles: 16,
      shake: 0.15,
      wobble: 0.25,
    },
  },

  ui: {
    accent: "#ff7a3a",
    progressColor: "#ff8a4a",
    progressBg: "rgba(255,255,255,0.12)",
    panelBg: "rgba(20,24,30,0.55)",
    textColor: "#ffffff",
    popupDuration: 0.9,
  },

  audio: {
    sfxVolume: 0.7,
    themeVolume: 0.35,
    // ignore soft resting contacts below this relative speed (units/s)
    bounceMinSpeed: 1.2,
    bounceCooldownMs: 60,
  },
};
