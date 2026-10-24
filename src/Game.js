import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { CONFIG } from './config.js';
import { TextureBank, valueColor } from './textures.js';
import { Effects } from './effects.js';
import { UI } from './ui.js';
import { AudioBank } from './audio.js';

const C = CONFIG;
const BOARD = C.board;
const SIZE = C.box.size;
const HALF = SIZE / 2;
const INNER_HALF_W = BOARD.width / 2;

const pairKey = (a, b) => (a.id < b.id ? a.id * 100000 + b.id : b.id * 100000 + a.id);
const easeInOut = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
const easeOutBack = (t) => { const c = 1.70158; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); };

export class Game {
  /**
   * hooks: { best, onStart(), onBest(best), onGameOver({ score, best, newBest }), onLogin() }
   * The board is built behind the start menu; nothing moves until `start()` is called.
   */
  constructor(root, assets, hooks = {}) {
    this.root = root;
    this.assets = assets;
    this.hooks = hooks;
    this.entities = [];
    this.clock = new THREE.Clock();
    this.shake = 0;
    this.started = false;

    this._initRenderer();
    this._initScene();
    this._initPhysics();
    this._buildLevel();
    this.textures = new TextureBank(this.renderer, assets.glove);
    this.effects = new Effects(this.scene);
    this.audio = new AudioBank();
    this.ui = new UI(root, {
      onPlay: () => this.start(),
      onLogin: () => hooks.onLogin?.(),
      onMuteToggle: () => this._toggleMute(),
    });
    this.boxGeometry = new RoundedBoxGeometry(SIZE, SIZE, SIZE, 3, C.box.cornerRadius);
    this._initInput();
    document.addEventListener('visibilitychange', () => {
      this.audio.setSuspended(document.hidden);
    });

    this.best = hooks.best || 0;
    this.restart();
    this.renderer.setAnimationLoop(() => this._tick());
  }

  _toggleMute() {
    this.audio.setUserMuted(!this.audio.userMuted);
    this.ui.setMuted(this.audio.userMuted);
  }

  get playing() { return this.started && !this.over; }

  // ---------------------------------------------------------------- setup

  _initRenderer() {
    const r = new THREE.WebGLRenderer({ antialias: C.render.antialias, powerPreference: 'high-performance' });
    r.setPixelRatio(Math.min(window.devicePixelRatio, C.render.maxPixelRatio));
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMappingExposure = C.render.exposure;
    r.shadowMap.enabled = C.render.shadows;
    r.shadowMap.type = THREE.PCFSoftShadowMap;
    r.domElement.className = 'game';
    this.root.appendChild(r.domElement);
    this.renderer = r;
    window.addEventListener('resize', () => this._resize());
  }

  _initScene() {
    const s = new THREE.Scene();
    s.background = new THREE.Color(C.render.background);
    this.scene = s;
    this.camera = new THREE.PerspectiveCamera(C.camera.fov, 1, 0.1, 200);
    this.cameraBase = new THREE.Vector3(...C.camera.position);
    this.cameraTarget = new THREE.Vector3(...C.camera.lookAt);
    this._resize();

    const L = C.lights;
    s.add(new THREE.AmbientLight(L.ambient.color, L.ambient.intensity));
    s.add(new THREE.HemisphereLight(L.hemisphere.sky, L.hemisphere.ground, L.hemisphere.intensity));
    const d = new THREE.DirectionalLight(L.directional.color, L.directional.intensity);
    d.position.set(...L.directional.position);
    d.target.position.set(0, 0, (BOARD.backZ + BOARD.frontZ) / 2);
    if (C.render.shadows) {
      d.castShadow = true;
      d.shadow.mapSize.set(C.render.shadowMapSize, C.render.shadowMapSize);
      const cam = d.shadow.camera;
      const ext = Math.max(BOARD.width, BOARD.frontZ - BOARD.backZ) / 2 + 2;
      cam.left = -ext; cam.right = ext; cam.top = ext; cam.bottom = -ext;
      cam.near = 1; cam.far = 50;
      d.shadow.bias = -0.0005;
      d.shadow.normalBias = 0.02;
    }
    s.add(d, d.target);
  }

  _resize() {
    const w = window.innerWidth, h = window.innerHeight;
    const aspect = w / h;
    const ref = C.camera.referenceAspect;
    const base = THREE.MathUtils.degToRad(C.camera.fov);
    const fov = aspect < ref ? 2 * Math.atan(Math.tan(base / 2) * (ref / aspect)) : base;
    this.camera.fov = THREE.MathUtils.radToDeg(fov);
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
    this.renderer?.setSize(w, h);
  }

  _initPhysics() {
    const P = C.physics;
    const w = new CANNON.World({ gravity: new CANNON.Vec3(0, P.gravity, 0) });
    w.broadphase = new CANNON.NaiveBroadphase();
    w.solver.iterations = P.solverIterations;
    w.allowSleep = false;
    // cannon-es clamps friction as an impulse per step and per contact point (a box on a plane has 4),
    // so scale it to make `friction` values behave like real Coulomb friction coefficients
    w.frictionGravity = new CANNON.Vec3(0, (Math.abs(P.gravity) * P.fixedTimeStep) / 4, 0);
    this.matFloor = new CANNON.Material('floor');
    this.matBox = new CANNON.Material('box');
    this.matWall = new CANNON.Material('wall');
    this.matThrown = new CANNON.Material('thrown');
    const cm = (a, b, f, r) => w.addContactMaterial(new CANNON.ContactMaterial(a, b, { friction: f, restitution: r }));
    cm(this.matBox, this.matFloor, P.friction.boxFloor, P.restitution.boxFloor);
    cm(this.matBox, this.matBox, P.friction.boxBox, P.restitution.boxBox);
    cm(this.matBox, this.matWall, P.friction.boxWall, P.restitution.boxWall);
    cm(this.matThrown, this.matFloor, 0, 0);
    cm(this.matThrown, this.matBox, P.friction.boxBox, P.restitution.boxBox);
    cm(this.matThrown, this.matWall, P.friction.boxWall, P.restitution.boxWall);
    this.world = w;
    // contacts are collected after every substep so short impacts are never missed
    this.touching = new Set();
    this.contacting = new Set();
    w.addEventListener('preStep', () => this._updatePusher(P.fixedTimeStep));
    w.addEventListener('postStep', () => {
      const next = new Set();
      const A = C.audio;
      for (const c of w.contacts) {
        const bi = c.bi, bj = c.bj;
        const a = bi.entity, b = bj.entity;
        if (a && b) this.touching.add(pairKey(bi, bj));
        if (a && bj !== this.floorBody) a.hit = true;
        if (b && bi !== this.floorBody) b.hit = true;

        const key = pairKey(bi, bj);
        next.add(key);
        if (this.contacting.has(key) || !this.playing) continue;
        const rv = bi.velocity.vsub(bj.velocity);
        if (rv.length() < A.bounceMinSpeed) continue;
        if (a && b) this.audio.play('bounceBox', { minInterval: A.bounceCooldownMs });
        else if ((a || b) && bi !== this.floorBody && bj !== this.floorBody
          && (bi.material === this.matWall || bj.material === this.matWall)) {
          this.audio.play('bounceWall', { minInterval: A.bounceCooldownMs });
        }
      }
      this.contacting = next;
    });
  }

  _staticBox(x, y, z, sx, sy, sz, material, color, opts = {}) {
    const body = new CANNON.Body({ mass: 0, material, shape: new CANNON.Box(new CANNON.Vec3(sx / 2, sy / 2, sz / 2)) });
    body.position.set(x, y, z);
    this.world.addBody(body);
    if (color) {
      const geo = opts.radius ? new RoundedBoxGeometry(sx, sy, sz, 3, Math.min(opts.radius, sx / 2, sy / 2, sz / 2)) : new THREE.BoxGeometry(sx, sy, sz);
      const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color, roughness: BOARD.walls.roughness, metalness: BOARD.walls.metalness }));
      mesh.position.set(x, y, z);
      mesh.castShadow = mesh.receiveShadow = true;
      this.scene.add(mesh);
    }
    return body;
  }

  _buildLevel() {
    const W = BOARD.walls;
    const len = BOARD.frontZ - BOARD.backZ;
    const midZ = (BOARD.frontZ + BOARD.backZ) / 2;
    const pusherT = C.pusher.thickness;

    // floor
    const floorBody = new CANNON.Body({ mass: 0, material: this.matFloor, shape: new CANNON.Plane() });
    floorBody.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
    this.world.addBody(floorBody);
    this.floorBody = floorBody;

    const fc = document.createElement('canvas');
    fc.width = 8; fc.height = 256;
    const fctx = fc.getContext('2d');
    const g = fctx.createLinearGradient(0, 0, 0, 256);
    BOARD.floor.colors.forEach((col, i, a) => g.addColorStop(i / (a.length - 1), col));
    fctx.fillStyle = g;
    fctx.fillRect(0, 0, 8, 256);
    const ftex = new THREE.CanvasTexture(fc);
    ftex.colorSpace = THREE.SRGBColorSpace;
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(BOARD.width, len + pusherT),
      new THREE.MeshStandardMaterial({ map: ftex, roughness: BOARD.floor.roughness, metalness: BOARD.floor.metalness }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(0, 0, midZ - pusherT / 2);
    floor.receiveShadow = true;
    this.scene.add(floor);

    // base slab under everything
    const base = new THREE.Mesh(
      new RoundedBoxGeometry(BOARD.width + W.thickness * 2 + 0.3, BOARD.base.depth, len + pusherT + W.thickness * 2 + 0.3, 3, 0.2),
      new THREE.MeshStandardMaterial({ color: BOARD.base.color, roughness: 0.5 }),
    );
    base.position.set(0, -BOARD.base.depth / 2 - 0.01, midZ - pusherT / 2);
    base.receiveShadow = true;
    this.scene.add(base);

    // side / front / back walls
    const wh = W.height, wt = W.thickness;
    const totalLen = len + pusherT + wt * 2;
    const wallMidZ = midZ - pusherT / 2;
    const sideX = INNER_HALF_W + wt / 2;
    this._staticBox(-sideX, wh / 2, wallMidZ, wt, wh, totalLen, this.matWall, W.color, { radius: W.cornerRadius });
    this._staticBox(sideX, wh / 2, wallMidZ, wt, wh, totalLen, this.matWall, W.color, { radius: W.cornerRadius });
    this._staticBox(0, wh / 2, BOARD.frontZ + wt / 2, BOARD.width, wh, wt, this.matWall, W.frontColor, { radius: W.cornerRadius });
    this._staticBox(0, wh / 2, BOARD.backZ - pusherT - wt / 2, BOARD.width, wh, wt, this.matWall, W.color, { radius: W.cornerRadius });
    // tall invisible guards so jumping boxes never leave the lane
    this._staticBox(-sideX, 3, wallMidZ, wt, 6, totalLen, this.matWall, null);
    this._staticBox(sideX, 3, wallMidZ, wt, 6, totalLen, this.matWall, null);
    this._staticBox(0, 3, BOARD.backZ - pusherT - wt / 2, BOARD.width, 6, wt, this.matWall, null);

    for (const o of BOARD.obstacles) {
      const h = o.height ?? wh;
      this._staticBox(o.x, h / 2, o.z, o.width, h, o.depth, this.matWall, o.color ?? W.color, { radius: W.cornerRadius });
    }

    // red game-over line
    const line = new THREE.Mesh(
      new THREE.PlaneGeometry(BOARD.width, BOARD.line.width),
      new THREE.MeshBasicMaterial({ color: BOARD.line.color, transparent: true, opacity: BOARD.line.opacity }),
    );
    line.rotation.x = -Math.PI / 2;
    line.position.set(0, 0.012, BOARD.lineZ);
    this.scene.add(line);
    this.lineMesh = line;

    // pusher (kinematic back wall)
    const Pz = C.pusher;
    this.pusherRestZ = BOARD.backZ - pusherT / 2;
    this.pusherBody = new CANNON.Body({ mass: 0, type: CANNON.Body.KINEMATIC, material: this.matWall, shape: new CANNON.Box(new CANNON.Vec3(BOARD.width / 2, Pz.height / 2, pusherT / 2)) });
    this.pusherBody.position.set(0, Pz.height / 2, this.pusherRestZ);
    this.world.addBody(this.pusherBody);
    this.pusherMat = new THREE.MeshStandardMaterial({ color: Pz.color, roughness: 0.4, metalness: 0.1, emissive: new THREE.Color(Pz.warnColor), emissiveIntensity: 0 });
    this.pusherMesh = new THREE.Mesh(new RoundedBoxGeometry(BOARD.width - 0.02, Pz.height, pusherT, 3, 0.08), this.pusherMat);
    this.pusherMesh.castShadow = this.pusherMesh.receiveShadow = true;
    this.scene.add(this.pusherMesh);

    // aim line
    const A = C.throw.aimLine;
    const ac = document.createElement('canvas');
    ac.width = 4; ac.height = 128;
    const actx = ac.getContext('2d');
    const ag = actx.createLinearGradient(0, 0, 0, 128);
    ag.addColorStop(0, 'rgba(255,255,255,0)');
    ag.addColorStop(0.25, 'rgba(255,255,255,1)');
    ag.addColorStop(1, 'rgba(255,255,255,1)');
    actx.fillStyle = ag;
    actx.fillRect(0, 0, 4, 128);
    const aimLen = C.throw.spawnZ - BOARD.backZ;
    this.aimLine = new THREE.Mesh(
      new THREE.PlaneGeometry(A.width, aimLen),
      new THREE.MeshBasicMaterial({ color: A.color, alphaMap: new THREE.CanvasTexture(ac), transparent: true, opacity: A.opacity, depthWrite: false }),
    );
    this.aimLine.rotation.x = -Math.PI / 2;
    this.aimLine.position.set(0, 0.02, BOARD.backZ + aimLen / 2);
    this.aimLine.visible = false;
    this.scene.add(this.aimLine);
  }

  _initInput() {
    const el = this.renderer.domElement;
    this.raycaster = new THREE.Raycaster();
    this.dragPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -HALF);
    this.drag = null;
    this.keys = new Set();

    el.addEventListener('pointerdown', (e) => {
      if (!this.held || !this.playing || this.drag) return;
      el.setPointerCapture(e.pointerId);
      const x = this._pointerWorldX(e);
      this.drag = { id: e.pointerId, startX: x ?? 0, boxX: this.held.mesh.position.x };
    });
    el.addEventListener('pointermove', (e) => {
      if (!this.drag || e.pointerId !== this.drag.id || !this.held) return;
      const x = this._pointerWorldX(e);
      if (x != null) this._setHeldX(this.drag.boxX + (x - this.drag.startX));
    });
    const end = (e) => {
      if (!this.drag || e.pointerId !== this.drag.id) return;
      this.drag = null;
      if (e.type === 'pointerup') this._throw();
    };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);

    window.addEventListener('keydown', (e) => {
      this.keys.add(e.code);
      if (!this.playing) return;
      // keep the embedding page from scrolling and focused buttons from being pressed mid-game
      if (['Space', 'Enter', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
      if ((e.code === 'Space' || e.code === 'Enter' || e.code === 'ArrowUp' || e.code === 'KeyW') && !e.repeat) this._throw();
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
  }

  _pointerWorldX(e) {
    const r = this.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.camera);
    const hit = new THREE.Vector3();
    return this.raycaster.ray.intersectPlane(this.dragPlane, hit) ? hit.x : null;
  }

  _setHeldX(x) {
    const half = this.held.kind === 'glove' ? HALF * C.boosters.glove.scale[0] : HALF;
    const lim = INNER_HALF_W - half - C.throw.edgeMargin;
    this.held.mesh.position.x = THREE.MathUtils.clamp(x, -lim, lim);
  }

  // ---------------------------------------------------------------- game state

  start() {
    if (this.over || this.started) this.restart();
    this.started = true;
    this.ui.hideMenu();
    this.audio.playTheme();
    this.hooks.onStart?.();
  }

  setBest(best) {
    this.best = Math.max(best, this.score);
    this.ui.setBest(this.best);
  }

  restart() {
    for (const e of this.entities) this._removeEntity(e);
    this.entities = [];
    this.effects.clear();
    this.held = null;
    this.drag = null;
    this.over = false;
    this.score = 0;
    this.bestAtStart = this.best;
    this.progress = 0;
    this.boosterThreshold = C.boosters.firstThreshold;
    this.boosterQueue = [];
    this.backRowQueue = [];
    this.throws = 0;
    this.playTime = 0;
    this.idleTime = 0;
    this.highScoreAnnounced = false;
    this.spawnTimer = 0;
    this.wildTimer = 0;
    this.wildIndex = 0;
    this.contacting = new Set();
    this.pusher = { phase: 'idle', t: 0, timer: 0, pendingDelay: -1 };
    this.pusherBody.position.z = this.pusherRestZ;
    this.pusherBody.velocity.set(0, 0, 0);
    this.ui.hideGameOver();
    this.ui.setScore(0, this.best);
    this.ui.setProgress(0);

    for (const b of C.spawn.initialBoxes) {
      const e = this._createEntity('normal', b.value);
      this._addBody(e, new THREE.Vector3(b.x, HALF, C.spawn.initialZ));
      e.state = 'board';
      e.armed = true;
    }
    this.next = this._rollNext();
    this._spawnHeld();
  }

  _rollNext() {
    if (this.boosterQueue.length) return { kind: this.boosterQueue.shift() };
    return { kind: 'normal', value: this._pickSpawnValue() };
  }

  _pickSpawnValue() {
    const S = C.spawn;
    const max = Math.min(this._boardMaxValue(), S.maxSpawnValue);
    let vals = [];
    for (let v = 2; v <= max; v *= 2) vals.push(v);
    if (!vals.length) vals = S.fallbackPool;
    const weights = vals.map((_, i) => Math.pow(S.smallBias, i));
    let r = Math.random() * weights.reduce((a, b) => a + b, 0);
    for (let i = 0; i < vals.length; i++) { r -= weights[i]; if (r <= 0) return vals[i]; }
    return vals[0];
  }

  _boardMaxValue() {
    let m = 2;
    for (const e of this.entities) if (e.kind === 'normal' && e.value > m) m = e.value;
    return m;
  }

  _spawnHeld() {
    const item = this.next;
    this.next = this._rollNext();
    this._refreshNextUI();
    const e = this._createEntity(item.kind, item.value);
    e.mesh.position.set(0, e.half, C.throw.spawnZ);
    e.state = 'held';
    e.spawnAnim = 0;
    e.mesh.scale.setScalar(0.001);
    this.held = e;
    this.aimLine.visible = C.throw.aimLine.enabled;
  }

  _refreshNextUI() {
    this.ui.setNext(this.textures.faceCanvas({ ...this.next, displayValue: this._wildDisplayValue() }));
  }

  _createEntity(kind, value) {
    let material;
    if (kind === 'bomb') material = this.textures.bombMaterial();
    else if (kind === 'glove') material = this.textures.gloveMaterial();
    else if (kind === 'wild') material = this.textures.wildMaterial();
    else material = this.textures.valueMaterial(value);
    const mesh = new THREE.Mesh(this.boxGeometry, material);
    mesh.castShadow = mesh.receiveShadow = true;
    let half = HALF;
    if (kind === 'glove') {
      mesh.scale.set(...C.boosters.glove.scale);
      half = HALF * C.boosters.glove.scale[1];
    }
    if (kind === 'bomb') {
      // bombs get their own material instance so they can blink independently
      mesh.material = material.clone();
      mesh.material.emissive = new THREE.Color('#ffffff');
      mesh.material.emissiveIntensity = 0;
    }
    this.scene.add(mesh);
    const e = { kind, value, mesh, body: null, half, state: 'new', armed: false, overLine: 0, stall: 0, age: 0, cooldown: 0, spawnAnim: -1, popAnim: -1 };
    this.entities.push(e);
    return e;
  }

  _addBody(e, pos) {
    const P = C.physics;
    const body = new CANNON.Body({
      mass: P.boxMass,
      material: this.matBox,
      shape: new CANNON.Box(new CANNON.Vec3(HALF, HALF, HALF)),
      linearDamping: P.linearDamping,
      angularDamping: P.angularDamping,
    });
    body.angularFactor.set(...P.angularFactor);
    body.position.set(pos.x, pos.y, pos.z);
    body.entity = e;
    this.world.addBody(body);
    e.body = body;
    e.mesh.position.copy(pos);
  }

  _removeEntity(e) {
    if (e.state === 'dead') return;
    e.state = 'dead';
    this.scene.remove(e.mesh);
    if (e.kind === 'bomb') e.mesh.material.dispose();
    if (e.body) { this.world.removeBody(e.body); e.body.entity = null; }
    if (this.held === e) this.held = null;
  }

  _throw() {
    const e = this.held;
    if (!e || this.over || e.spawnAnim >= 0) return;
    this.held = null;
    this.aimLine.visible = false;
    e.state = 'moving';
    e.age = 0;
    if (e.kind === 'glove') {
      e.gloveZ = e.mesh.position.z;
    } else {
      this._addBody(e, e.mesh.position.clone());
      e.body.velocity.set(0, 0, -C.throw.speed);
      e.body.linearDamping = C.physics.thrownLinearDamping;
      e.body.angularFactor.set(0, 0, 0);
      e.body.material = this.matThrown;
      e.hit = false;
    }
    this.throws++;
    this.idleTime = 0;
    this.spawnTimer = C.throw.spawnDelay;
    this.audio.play('shoot');
    const Pz = C.pusher;
    if (Pz.enabled && Pz.trigger === 'throws' && this.throws % Pz.everyThrows === 0) {
      this.pusher.pendingDelay = Pz.delayAfterThrow;
    }
  }

  _pusherInterval() {
    const Pz = C.pusher;
    const steps = Math.floor(this.playTime / Pz.secondsPerIntervalStep);
    return Math.max(Pz.minEverySeconds, Pz.everySeconds - steps);
  }

  _settle(e) {
    if (e.kind !== 'bomb') e.state = 'board';
    e.body.linearDamping = C.physics.linearDamping;
    e.body.angularFactor.set(...C.physics.angularFactor);
    e.body.material = this.matBox;
  }

  _addScore(points, worldPos) {
    this.score += points;
    let newHigh = false;
    if (this.score > this.best) {
      this.best = this.score;
      this.hooks.onBest?.(this.best);
    }
    if (!this.highScoreAnnounced && this.score > this.bestAtStart) {
      this.highScoreAnnounced = true;
      newHigh = true;
      this.audio.play('highScore');
    }
    this.ui.setScore(this.score, this.best);
    const p = this._toScreen(worldPos);
    this.ui.popup('+' + points, p.x, p.y);

    this.progress += points;
    if (this.progress >= this.boosterThreshold) this._awardBooster();
    this.ui.setProgress(this.progress / this.boosterThreshold);
    if (newHigh) this.ui.toast('NEW HIGH SCORE');
  }

  _awardBooster() {
    this.progress = 0;
    this.boosterThreshold = Math.round(this.boosterThreshold * C.boosters.thresholdGrowth);
    const w = C.boosters.weights;
    const kinds = Object.keys(w).filter((k) => w[k] > 0);
    if (!kinds.length) return;
    let r = Math.random() * kinds.reduce((a, k) => a + w[k], 0);
    let kind = kinds[0];
    for (const k of kinds) { r -= w[k]; if (r <= 0) { kind = k; break; } }
    if (this.next.kind === 'normal') this.next = { kind };
    else this.boosterQueue.push(kind);
    this._refreshNextUI();
    this.audio.play('booster');
    this.ui.toast({ bomb: 'TNT!', wild: 'ANY VALUE MATCH!', glove: 'BOXING GLOVE!' }[kind]);
  }

  _toScreen(v) {
    const p = new THREE.Vector3(v.x, v.y, v.z).project(this.camera);
    return { x: (p.x * 0.5 + 0.5) * window.innerWidth, y: (-p.y * 0.5 + 0.5) * window.innerHeight };
  }

  _gameOver(culprit) {
    if (this.over) return;
    this.over = true;
    this.drag = null;
    this.aimLine.visible = false;
    this.audio.stopTheme();
    if (culprit) {
      culprit.mesh.material = culprit.mesh.material.clone();
      culprit.mesh.material.emissive = new THREE.Color('#ff0000');
      culprit.blink = true;
    }
    this.shake = 0.3;
    this.hooks.onGameOver?.({ score: this.score, best: this.best, newBest: this.score > this.bestAtStart });
    setTimeout(() => this.ui.showGameOver(this.score, this.best), 700);
  }

  // ---------------------------------------------------------------- mechanics

  _merge(a, b, value) {
    const pa = a.body.position, pb = b.body.position;
    const pos = new THREE.Vector3((pa.x + pb.x) / 2, Math.max(pa.y, pb.y, HALF), (pa.z + pb.z) / 2);
    const armed = a.armed || b.armed || pos.z + HALF < BOARD.lineZ;
    this._removeEntity(a);
    this._removeEntity(b);

    const M = C.merge;
    const e = this._createEntity('normal', value);
    this._addBody(e, pos);
    e.state = 'board';
    e.armed = armed;
    e.cooldown = M.cooldown;
    e.popAnim = 0;

    // jump and drift towards the closest box with the same value
    let target = null, best = M.seekMaxDistance;
    for (const o of this.entities) {
      if (o === e || !o.body || o.state === 'dead' || o.kind !== 'normal' || o.value !== value) continue;
      const d = Math.hypot(o.body.position.x - pos.x, o.body.position.z - pos.z);
      if (d < best) { best = d; target = o; }
    }
    let vx = 0, vz = 0;
    const g = Math.abs(C.physics.gravity);
    const airTime = (2 * M.jumpVelocity) / g;
    if (target) {
      const dx = target.body.position.x - pos.x, dz = target.body.position.z - pos.z;
      const d = Math.hypot(dx, dz) || 1;
      const travel = Math.max(0, d - SIZE * 0.85) * M.seekStrength;
      vx = (dx / d) * (travel / airTime);
      vz = (dz / d) * (travel / airTime);
    }
    e.body.velocity.set(vx, M.jumpVelocity, vz);
    e.body.angularVelocity.set((Math.random() - 0.5) * M.spin, (Math.random() - 0.5) * M.spin, (Math.random() - 0.5) * M.spin);

    this.effects.burst(pos, valueColor(value), M.particles, M.particleSpeed);
    this.audio.play('merge');
    this._addScore(value, pos);
  }

  _checkMerges() {
    const touching = this.touching;
    const inContact = (a, b) => touching.has(pairKey(a.body, b.body));
    const list = this.entities.filter((e) => e.body && e.state !== 'dead' && (e.kind === 'normal' || e.kind === 'wild') && e.cooldown <= 0);
    const maxD = SIZE * C.merge.touchDistanceFactor;
    for (let i = 0; i < list.length; i++) {
      const a = list[i];
      if (a.state === 'dead') continue;
      for (let j = i + 1; j < list.length; j++) {
        const b = list[j];
        if (b.state === 'dead') continue;
        let value = 0;
        if (a.kind === 'normal' && b.kind === 'normal') { if (a.value === b.value) value = a.value * 2; }
        else if (a.kind === 'wild' && b.kind === 'normal') value = b.value * 2;
        else if (b.kind === 'wild' && a.kind === 'normal') value = a.value * 2;
        if (!value) continue;
        if (inContact(a, b) || a.body.position.distanceTo(b.body.position) < maxD) {
          this._merge(a, b, value);
          break;
        }
      }
    }
    touching.clear();
  }

  _explode(bomb) {
    const B = C.boosters.bomb;
    const c = bomb.body.position.clone();
    const pos = new THREE.Vector3(c.x, c.y, c.z);
    this._removeEntity(bomb);
    for (const e of this.entities) {
      if (!e.body || e.state === 'dead') continue;
      const p = e.body.position;
      const d = p.distanceTo(c);
      if (d <= B.radius) {
        this.effects.burst(p, e.kind === 'normal' ? valueColor(e.value) : '#ffffff', 10, 6);
        this._removeEntity(e);
      } else if (d <= B.radius * B.blastFalloffRadius) {
        const k = 1 - (d - B.radius) / (B.radius * (B.blastFalloffRadius - 1));
        const dir = new CANNON.Vec3(p.x - c.x, 0, p.z - c.z);
        dir.normalize();
        e.body.applyImpulse(new CANNON.Vec3(dir.x * B.blastImpulse * k, B.blastImpulse * 0.5 * k, dir.z * B.blastImpulse * k));
      }
    }
    this.effects.explosion(pos, B.radius, B.flashColor);
    this.effects.burst(pos, B.flashColor, B.particles * 0.5, 9, 1.4);
    this.effects.burst(pos, B.color, B.particles * 0.5, 7, 1.2);
    this.shake = Math.max(this.shake, B.shake);
  }

  _updateGlove(e, dt) {
    const G = C.boosters.glove;
    e.gloveZ -= G.speed * dt;
    e.mesh.position.z = e.gloveZ;
    e.mesh.position.y = e.half + Math.abs(Math.sin(e.age * 18)) * 0.08;
    e.mesh.rotation.z = Math.sin(e.age * 25) * G.wobble * 0.3;
    const hx = HALF * G.scale[0], hz = HALF * G.scale[2];
    for (const o of this.entities) {
      if (!o.body || o.state === 'dead') continue;
      const p = o.body.position;
      if (Math.abs(p.x - e.mesh.position.x) < hx + HALF * 0.9 && Math.abs(p.z - e.gloveZ) < hz + HALF) {
        this.effects.burst(p, o.kind === 'normal' ? valueColor(o.value) : '#ffffff', G.hitParticles, 6);
        this._removeEntity(o);
        this.shake = Math.max(this.shake, G.shake);
      }
    }
    if (e.gloveZ - hz <= BOARD.backZ) {
      this.effects.burst(e.mesh.position, '#ff3030', 24, 5, 1.3);
      this._removeEntity(e);
    }
  }

  _updatePusher(dt) {
    const Pz = C.pusher;
    const s = this.pusher;
    if (!Pz.enabled) return;
    if (s.phase === 'idle' && this.playing) {
      if (Pz.trigger === 'time') {
        s.timer += dt;
        if (s.timer >= this._pusherInterval()) {
          s.timer = 0; s.phase = 'warn'; s.t = 0;
          this.audio.play('wallWarning');
        }
      } else if (s.pendingDelay >= 0) {
        s.pendingDelay -= dt;
        if (s.pendingDelay < 0) {
          s.phase = 'warn'; s.t = 0;
          this.audio.play('wallWarning');
        }
      }
    }
    s.t += dt;
    let offset = 0;
    switch (s.phase) {
      case 'warn':
        this.pusherMat.emissiveIntensity = (Math.sin(s.t * 22) * 0.5 + 0.5) * 0.9;
        if (s.t >= Pz.warnDuration) { s.phase = 'push'; s.t = 0; this.pusherMat.emissiveIntensity = 0.4; }
        break;
      case 'push':
        offset = Pz.distance * easeInOut(Math.min(1, s.t / Pz.pushDuration));
        if (s.t >= Pz.pushDuration) { s.phase = 'hold'; s.t = 0; }
        break;
      case 'hold':
        offset = Pz.distance;
        if (s.t >= Pz.holdDuration) { s.phase = 'return'; s.t = 0; this.pusherMat.emissiveIntensity = 0; }
        break;
      case 'return':
        offset = Pz.distance * (1 - easeInOut(Math.min(1, s.t / Pz.returnDuration)));
        if (s.t >= Pz.returnDuration) {
          s.phase = 'idle';
          s.t = 0;
          if (Pz.spawnBoxes.enabled) this._queueBackRow();
        }
        break;
      default:
        this.pusherMat.emissiveIntensity = 0;
    }
    const targetZ = this.pusherRestZ + offset;
    this.pusherBody.velocity.z = dt > 0 ? (targetZ - this.pusherBody.position.z) / dt : 0;
  }

  _queueBackRow() {
    const S = C.pusher.spawnBoxes;
    S.xPositions.forEach((x, i) => this.backRowQueue.push({ x, delay: i * S.stagger }));
  }

  _updateBackRow(dt) {
    const S = C.pusher.spawnBoxes;
    for (let i = this.backRowQueue.length - 1; i >= 0; i--) {
      const q = this.backRowQueue[i];
      q.delay -= dt;
      if (q.delay > 0) continue;
      this.backRowQueue.splice(i, 1);
      const e = this._createEntity('normal', this._pickSpawnValue());
      this._addBody(e, new THREE.Vector3(q.x, HALF + S.dropHeight, S.z));
      e.state = 'board';
      e.armed = true;
      e.spawnAnim = 0;
      e.mesh.scale.setScalar(0.001);
    }
  }

  _checkGameOver(dt) {
    const G = C.gameOver;
    for (const e of this.entities) {
      if (!e.body || e.state === 'dead' || e.kind === 'bomb') continue;
      const front = e.body.position.z + HALF;
      if (!e.armed && front < BOARD.lineZ) e.armed = true;
      if (e.armed) {
        if (front > BOARD.lineZ) {
          e.overLine += dt;
          if (e.overLine >= G.graceTime) return this._gameOver(e);
        } else e.overLine = 0;
      } else if (e.age > 0.3 && e.body.velocity.length() < G.stallSpeed) {
        e.stall += dt;
        if (e.stall >= G.stallTime) return this._gameOver(e);
      }
    }
  }

  _wildDisplayValue() {
    const max = this._boardMaxValue();
    const n = Math.max(1, Math.round(Math.log2(max)));
    return Math.pow(2, (this.wildIndex % n) + 1);
  }

  _updateWild(dt) {
    const W = C.boosters.wild;
    const mat = this.textures.wildMaterial();
    mat.emissive.setHSL((performance.now() / 1000 * W.hueSpeed) % 1, 1, 0.5);
    this.wildTimer += dt;
    if (this.wildTimer < W.cycleInterval) return;
    this.wildTimer = 0;
    const max = this._boardMaxValue();
    const n = Math.max(1, Math.round(Math.log2(max)));
    this.wildIndex = (this.wildIndex + 1 + Math.floor(Math.random() * (n - 1))) % n;
    mat.map = this.textures.wildTexture(this._wildDisplayValue());
    if (this.next.kind === 'wild') this._refreshNextUI();
  }

  // ---------------------------------------------------------------- loop

  _tick() {
    const dt = Math.min(this.clock.getDelta(), 1 / 20);

    if (this.held && this.playing) {
      const h = this.held;
      let dir = 0;
      if (this.keys.has('ArrowLeft') || this.keys.has('KeyA')) dir -= 1;
      if (this.keys.has('ArrowRight') || this.keys.has('KeyD')) dir += 1;
      if (dir) this._setHeldX(h.mesh.position.x + dir * C.throw.keyboardSpeed * dt);
      this.aimLine.position.x = h.mesh.position.x;
      if (h.kind === 'bomb') h.mesh.material.emissiveIntensity = 0;
    }

    if (this.playing) this.world.step(C.physics.fixedTimeStep, dt, C.physics.maxSubSteps);

    const maxSpeed = Math.max(C.physics.maxSpeed, C.throw.speed * 1.05);
    for (const e of this.entities) {
      if (e.state === 'dead') continue;
      e.age += dt;
      if (e.cooldown > 0) e.cooldown -= dt;
      if (e.body) {
        const p = e.body.position, v = e.body.velocity;
        if (p.y < -3 || Math.abs(p.x) > INNER_HALF_W + 1 || p.z < BOARD.backZ - 3 || p.z > BOARD.frontZ + 2) {
          this._removeEntity(e);
          continue;
        }
        const sp = v.length();
        if (sp > maxSpeed) v.scale(maxSpeed / sp, v);
        e.mesh.position.copy(e.body.position);
        e.mesh.quaternion.copy(e.body.quaternion);
      }
      if (e.spawnAnim >= 0) {
        e.spawnAnim += dt / C.throw.spawnAnimDuration;
        const k = e.spawnAnim >= 1 ? 1 : easeOutBack(e.spawnAnim);
        const base = e.kind === 'glove' ? C.boosters.glove.scale : [1, 1, 1];
        e.mesh.scale.set(base[0] * k, base[1] * k, base[2] * k);
        if (e.spawnAnim >= 1) e.spawnAnim = -1;
      }
      if (e.popAnim >= 0) {
        e.popAnim += dt / C.merge.popDuration;
        const t = Math.min(1, e.popAnim);
        e.mesh.scale.setScalar(1 + (C.merge.popScale - 1) * Math.sin(t * Math.PI));
        if (t >= 1) e.popAnim = -1;
      }
      if (e.blink) e.mesh.material.emissiveIntensity = Math.sin(e.age * 20) > 0 ? 0.8 : 0;
    }

    if (this.playing) {
      this.playTime += dt;
      const B = C.boosters.bomb;
      for (const e of this.entities) {
        if (e.state !== 'moving') continue;
        if (e.kind === 'glove') this._updateGlove(e, dt);
        else if (e.kind === 'bomb') {
          e.mesh.material.emissiveIntensity = Math.sin(e.age * (10 + e.age * 20)) > 0 ? 0.6 : 0;
          const slow = e.body.velocity.length() < B.stopSpeed;
          if ((e.age > B.minFuse && slow) || e.age > B.maxFuse) this._explode(e);
        }
        if (e.state === 'moving' && e.body && (e.hit || (e.age > 0.3 && e.body.velocity.length() < 0.5))) this._settle(e);
      }
      this._updateBackRow(dt);
      this._checkMerges();
      this._checkGameOver(dt);
      if (this.entities.some((e) => e.state === 'dead')) this.entities = this.entities.filter((e) => e.state !== 'dead');

      if (!this.held && this.spawnTimer > 0) {
        this.spawnTimer -= dt;
        if (this.spawnTimer <= 0) this._spawnHeld();
      }

      this.idleTime += dt;
      const Bo = C.boosters;
      if (this.idleTime > Bo.idleGrace && this.progress > 0) {
        this.progress = Math.max(0, this.progress - Bo.idleDecayPerSecond * dt);
        this.ui.setProgress(this.progress / this.boosterThreshold);
      }
    }

    this.pusherMesh.position.copy(this.pusherBody.position);
    this._updateWild(dt);
    this.effects.update(dt);

    this.shake = Math.max(0, this.shake - dt * C.camera.shakeDecay * this.shake - dt * 0.05);
    this.camera.position.copy(this.cameraBase);
    if (this.shake > 0) this.camera.position.add(new THREE.Vector3((Math.random() - 0.5) * this.shake, (Math.random() - 0.5) * this.shake, 0));
    this.camera.lookAt(this.cameraTarget);

    this.renderer.render(this.scene, this.camera);
  }
}
