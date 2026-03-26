import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { InputManager } from './input.js';
import { AudioManager } from './audio.js';
import { generateTower, ZONES, TOWER_HEIGHT } from './levels.js';

// ─── Constants ───
const CYLINDER_RADIUS = 3;
const PLATFORM_THICKNESS = 0.2;
const PLATFORM_DEPTH = 0.8;
const PLAYER_SIZE = 0.25;
const GRAVITY = -18;
const JUMP_VELOCITY = 8;
const DOUBLE_JUMP_VELOCITY = 10.0;
const BOUNCE_VELOCITY = 13;
const BASE_SPEED = 1.2; // radians/sec
const DASH_SPEED_MULT = 3.5;
const DASH_DURATION = 0.3;
const DASH_COOLDOWN = 3.0;
const ENERGY_MAX = 100;
const DOUBLE_JUMP_COST = 24;
const DASH_COST = 25;
const ENERGY_REGEN = 15; // per second
const COYOTE_TIME = 0.1;
const PI2 = Math.PI * 2;
const LIVES_MAX = 3;
const FALL_OFF_DROP_FOR_LIFE = 1.9;
const FALL_OFF_GRACE_TIME = 0.2;
const RESPAWN_INVULN_TIME = 1.4;
const CRUMBLE_FUSE_TIME = 0.85;
const LANDING_ANGLE_PADDING = 0.08;
const LANDING_TOP_BUFFER = 0.36;
const LANDING_BOTTOM_BUFFER = 0.14;
const ENABLE_ENEMY_DAMAGE = false; // only falling can kill when false
const DEBUG_DEATH_LOGS = true;
const ZONE_VISUALS = [
    {
        fog: 0x041a2f,
        background: 0x020a15,
        bloom: 0.34,
        exposure: 0.95,
        grid: 0x1d5fac,
        wire: 0x2cb3ff,
        ambient: 0x2d4163,
        keyLight: 0x5ff3ff,
        fillLight: 0xff7f6d,
        towerEmissive: 0x0a4a68,
    },
    {
        fog: 0x1c1029,
        background: 0x090410,
        bloom: 0.4,
        exposure: 0.93,
        grid: 0x7f3278,
        wire: 0xe06cff,
        ambient: 0x4f2d59,
        keyLight: 0xff69ba,
        fillLight: 0x6f6dff,
        towerEmissive: 0x56247a,
    },
    {
        fog: 0x2b1510,
        background: 0x120805,
        bloom: 0.48,
        exposure: 0.98,
        grid: 0xa75b2a,
        wire: 0xffd063,
        ambient: 0x5a3b2b,
        keyLight: 0xffb35f,
        fillLight: 0xff4f70,
        towerEmissive: 0x7f3e1f,
    },
];
const PLATFORM_STYLE = {
    solid: { color: 0x52f0ff, emissive: 0x0c7f97 },
    crumbling: { color: 0xe3d05f, emissive: 0x7a6022 },
    bouncy: { color: 0xff62ca, emissive: 0x7f2874 },
    moving: { color: 0x59ffbd, emissive: 0x19875d },
    phasing: { color: 0x6d87ff, emissive: 0x28498f },
    conveyor: { color: 0xffa057, emissive: 0x8d4c1e },
    default: { color: 0x52f0ff, emissive: 0x0c7f97 },
};

// ─── Game State ───
let state = 'menu'; // menu, intro, countdown, playing, dead, victory
let score = 0;
let lives = LIVES_MAX;
let energy = ENERGY_MAX;
let maxHeight = 0;
let currentZone = 0;
let dashTimer = 0;
let dashCooldownTimer = 0;
let isDashing = false;
let coyoteTimer = 0;
let speedMultiplier = 1;
let introTimer = 0;
let countdownTimer = 0;
let countdownNumber = 3;
let hasSeenIntro = false; // only show intro once per session
let hitInvulnTimer = 0;
let lastSafeGroundHeight = 0;
let enemyContactLogTimer = 0;
let fallOffBaseY = 0;
let airborneSinceGround = 0;
const checkpoint = {
    platformIndex: 0,
    theta: 0,
    y: 0.5 + PLATFORM_THICKNESS / 2 + 0.05,
    valid: false,
};

// Player state (polar coords)
const player = {
    theta: 0,
    y: 1.5,
    vy: 0,
    jumpsUsed: 0,
    direction: -1, // -1 = CCW (left-to-right visually), 1 = CW
    grounded: false,
    ducking: false,
    isDead: false,
};

// ─── Setup Three.js ───
const canvas = document.getElementById('game-canvas');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.95;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x020a15);
scene.fog = new THREE.FogExp2(0x041a2f, 0.012);

const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 200);
camera.position.set(0, 5, 10);

// Post-processing
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloomPass = new UnrealBloomPass(
    new THREE.Vector2(window.innerWidth, window.innerHeight),
    0.45, 0.2, 0.9
);
bloomPass.threshold = 0.42;
bloomPass.strength = 0.45;
bloomPass.radius = 0.2;
composer.addPass(bloomPass);

// ─── Input & Audio ───
const input = new InputManager();
const audio = new AudioManager();

// ─── Scene Objects ───
let towerMesh, towerWireframe;
let platformMeshes = [];
let enemyMeshes = [];
let collectibleMeshes = [];
let playerMesh, playerGlow, playerTrail;
let starField;
let starFieldFar;
let gridPlane;
let towerRings = [];
let ambientLight;
let hemiLight;
let keyLight;
let fillLight;
let rimLight;
let playerLight;

const currentVisualBackground = new THREE.Color(0x020a15);
const targetVisualBackground = new THREE.Color(0x020a15);
const currentVisualFog = new THREE.Color(0x041a2f);
const targetVisualFog = new THREE.Color(0x041a2f);
const conveyorHighlightColor = new THREE.Color(0xffce7b);
const enemyWarnColor = new THREE.Color(0xff4343);
let targetBloomStrength = bloomPass.strength;
let targetExposure = renderer.toneMappingExposure;

// Level data
let levelData = null;
let platformStates = []; // runtime state for crumbling etc.
let enemyStates = [];
let collectibleStates = [];

// ─── Build Scene ───
function buildScene() {
    // Near starfield with per-star tint for richer depth.
    const starGeo = new THREE.BufferGeometry();
    const starPositions = [];
    const starColors = [];
    for (let i = 0; i < 2400; i++) {
        const radius = 80 + Math.random() * 130;
        const theta = Math.random() * PI2;
        const y = (Math.random() - 0.5) * 150;
        const color = new THREE.Color().setHSL(0.52 + Math.random() * 0.2, 0.75, 0.6 + Math.random() * 0.28);
        starPositions.push(Math.cos(theta) * radius, y, Math.sin(theta) * radius);
        starColors.push(color.r, color.g, color.b);
    }
    starGeo.setAttribute('position', new THREE.Float32BufferAttribute(starPositions, 3));
    starGeo.setAttribute('color', new THREE.Float32BufferAttribute(starColors, 3));
    const starMat = new THREE.PointsMaterial({
        size: 0.12,
        vertexColors: true,
        transparent: true,
        opacity: 0.45,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
    });
    starField = new THREE.Points(starGeo, starMat);
    scene.add(starField);

    // Distant starfield layer for depth.
    const farGeo = new THREE.BufferGeometry();
    const farPositions = [];
    for (let i = 0; i < 1500; i++) {
        const radius = 160 + Math.random() * 220;
        const theta = Math.random() * PI2;
        const y = (Math.random() - 0.5) * 210;
        farPositions.push(Math.cos(theta) * radius, y, Math.sin(theta) * radius);
    }
    farGeo.setAttribute('position', new THREE.Float32BufferAttribute(farPositions, 3));
    const farMat = new THREE.PointsMaterial({
        color: 0x8fdcff,
        size: 0.09,
        transparent: true,
        opacity: 0.22,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
    });
    starFieldFar = new THREE.Points(farGeo, farMat);
    scene.add(starFieldFar);

    // Grid plane below the tower.
    const gridGeo = new THREE.PlaneGeometry(280, 280, 130, 130);
    const gridMat = new THREE.MeshBasicMaterial({
        color: 0x1d5fac,
        wireframe: true,
        transparent: true,
        opacity: 0.2,
        depthWrite: false,
    });
    gridPlane = new THREE.Mesh(gridGeo, gridMat);
    gridPlane.rotation.x = -Math.PI / 2;
    gridPlane.position.y = -5;
    scene.add(gridPlane);

    // Thin pulse rings that travel up the spire.
    towerRings = [];
    for (let i = 0; i < 15; i++) {
        const ring = new THREE.Mesh(
            new THREE.TorusGeometry(CYLINDER_RADIUS + 0.03, 0.025, 8, 48),
            new THREE.MeshBasicMaterial({
                color: 0x5ff3ff,
                transparent: true,
                opacity: 0.05,
                blending: THREE.AdditiveBlending,
                depthWrite: false,
            })
        );
        ring.rotation.x = Math.PI / 2;
        ring.position.y = 1 + (i / 14) * (TOWER_HEIGHT - 2);
        ring.userData.baseY = ring.position.y;
        ring.userData.phase = Math.random() * PI2;
        towerRings.push(ring);
        scene.add(ring);
    }

    ambientLight = new THREE.AmbientLight(0x2d4163, 0.38);
    scene.add(ambientLight);

    hemiLight = new THREE.HemisphereLight(0x6aefff, 0x04080f, 0.28);
    scene.add(hemiLight);

    keyLight = new THREE.PointLight(0x5ff3ff, 1.2, 44, 2);
    keyLight.position.set(0, 12, 0);
    scene.add(keyLight);

    fillLight = new THREE.PointLight(0xff7f6d, 0.9, 46, 2);
    fillLight.position.set(0, 32, 0);
    scene.add(fillLight);

    rimLight = new THREE.DirectionalLight(0x8dbeff, 0.45);
    rimLight.position.set(-8, 24, 11);
    scene.add(rimLight);

    playerLight = new THREE.PointLight(0x5ff3ff, 0.85, 12, 2);
    playerLight.position.set(0, 3, 0);
    scene.add(playerLight);
}

function buildTower() {
    // Remove old tower
    if (towerMesh) scene.remove(towerMesh);
    if (towerWireframe) scene.remove(towerWireframe);
    platformMeshes.forEach(m => scene.remove(m));
    enemyMeshes.forEach(m => scene.remove(m));
    collectibleMeshes.forEach(m => scene.remove(m));
    platformMeshes = [];
    enemyMeshes = [];
    collectibleMeshes = [];

    // Tower cylinder shell
    const towerGeo = new THREE.CylinderGeometry(CYLINDER_RADIUS - 0.05, CYLINDER_RADIUS - 0.05, TOWER_HEIGHT, 32, 64, true);
    const towerMat = new THREE.MeshStandardMaterial({
        color: 0x16314c,
        metalness: 0.72,
        roughness: 0.28,
        emissive: 0x0a4a68,
        emissiveIntensity: 0.22,
        transparent: true,
        opacity: 0.42,
        side: THREE.DoubleSide,
    });
    towerMesh = new THREE.Mesh(towerGeo, towerMat);
    towerMesh.position.y = TOWER_HEIGHT / 2;
    scene.add(towerMesh);

    // Tower wireframe
    const wireGeo = new THREE.CylinderGeometry(CYLINDER_RADIUS, CYLINDER_RADIUS, TOWER_HEIGHT, 24, 40, true);
    const wireMat = new THREE.MeshBasicMaterial({
        color: 0x2cb3ff,
        wireframe: true,
        transparent: true,
        opacity: 0.28,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
    });
    towerWireframe = new THREE.Mesh(wireGeo, wireMat);
    towerWireframe.position.y = TOWER_HEIGHT / 2;
    scene.add(towerWireframe);

    // Generate level data
    levelData = generateTower();

    // Create platform meshes
    levelData.platforms.forEach((p, i) => {
        const mesh = createPlatformMesh(p);
        platformMeshes.push(mesh);
        scene.add(mesh);
        platformStates.push({
            ...p,
            originalTheta: p.theta,
            crumbleTimer: -1,
            destroyed: false,
            phaseTimer: Math.random() * PI2,
            visible: true,
        });
    });

    // Create enemy meshes
    levelData.enemies.forEach((e, i) => {
        const mesh = createEnemyMesh(e);
        enemyMeshes.push(mesh);
        scene.add(mesh);
        enemyStates.push({
            ...e,
            originalTheta: e.theta,
            timer: 0,
            active: true,
        });
    });

    // Create collectible meshes
    levelData.collectibles.forEach((c, i) => {
        const collectibleColor = c.value >= 100 ? 0xffc26d : (c.value >= 50 ? 0xff7ad4 : 0x68f5ff);
        const geo = new THREE.OctahedronGeometry(0.125, 0);
        const mat = new THREE.MeshStandardMaterial({
            color: collectibleColor,
            emissive: collectibleColor,
            emissiveIntensity: 0.55,
            metalness: 0.25,
            roughness: 0.18,
        });
        const mesh = new THREE.Mesh(geo, mat);

        const halo = new THREE.Mesh(
            new THREE.IcosahedronGeometry(0.19, 0),
            new THREE.MeshBasicMaterial({
                color: collectibleColor,
                transparent: true,
                opacity: 0.24,
                wireframe: true,
                depthWrite: false,
                blending: THREE.AdditiveBlending,
            })
        );
        mesh.add(halo);

        mesh.userData.baseY = c.y;
        mesh.userData.phase = Math.random() * PI2;
        mesh.userData.value = c.value;
        positionOnCylinder(mesh, c.theta, c.y, CYLINDER_RADIUS + 0.3);
        collectibleMeshes.push(mesh);
        scene.add(mesh);
        collectibleStates.push({ ...c, collected: false });
    });
}

function createPlatformMesh(p) {
    // Solid box platforms that protrude from the cylinder.
    const arcLength = p.width * CYLINDER_RADIUS; // width in world units
    const geo = new THREE.BoxGeometry(arcLength, PLATFORM_THICKNESS, PLATFORM_DEPTH);

    const style = PLATFORM_STYLE[p.type] || PLATFORM_STYLE.default;
    const mat = new THREE.MeshStandardMaterial({
        color: style.color,
        emissive: style.emissive,
        emissiveIntensity: 0.4,
        metalness: 0.28,
        roughness: 0.22,
        transparent: p.type === 'phasing',
        opacity: p.type === 'phasing' ? 0.62 : 1,
    });

    const group = new THREE.Group();

    // Main platform box
    const mesh = new THREE.Mesh(geo, mat);
    group.add(mesh);

    // Glowing top edge
    const edgeGeo = new THREE.BoxGeometry(arcLength + 0.05, 0.03, PLATFORM_DEPTH + 0.05);
    const edgeMat = new THREE.MeshBasicMaterial({
        color: style.color,
        transparent: true,
        opacity: 0.42,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
    });
    const edge = new THREE.Mesh(edgeGeo, edgeMat);
    edge.position.y = PLATFORM_THICKNESS / 2;
    group.add(edge);

    group.userData.mainMaterial = mat;
    group.userData.edgeMaterial = edgeMat;
    group.userData.baseColor = new THREE.Color(style.color);
    group.userData.baseEmissive = new THREE.Color(style.emissive);
    group.userData.phase = Math.random() * PI2;

    // Position on cylinder surface, protruding outward
    const r = CYLINDER_RADIUS + PLATFORM_DEPTH / 2;
    group.position.set(
        r * Math.cos(p.theta),
        p.y,
        r * Math.sin(p.theta)
    );
    // Rotate so the depth axis points outward from cylinder center
    group.rotation.y = -p.theta + Math.PI / 2;

    return group;
}

function createEnemyMesh(e) {
    let geo;
    let color = 0xff5048;
    let emissive = 0x922521;
    switch (e.type) {
        case 'sentinel':
            geo = new THREE.BoxGeometry(0.3, 0.3, 0.3);
            color = 0xff5d4d;
            emissive = 0x8f2a24;
            break;
        case 'orbiter':
            geo = new THREE.SphereGeometry(0.2, 8, 8);
            color = 0xff8a47;
            emissive = 0x99501b;
            break;
        case 'zapper':
            geo = new THREE.CylinderGeometry(0.05, 0.05, 0.8, 8);
            color = 0xffea5f;
            emissive = 0xa2711e;
            break;
        default:
            geo = new THREE.BoxGeometry(0.25, 0.25, 0.25);
            color = 0xff5048;
            emissive = 0x922521;
    }

    const mat = new THREE.MeshStandardMaterial({
        color,
        emissive,
        emissiveIntensity: 0.55,
        metalness: 0.2,
        roughness: 0.25,
    });

    const mesh = new THREE.Mesh(geo, mat);
    mesh.userData.baseColor = new THREE.Color(color);

    if (e.type === 'zapper') {
        const aura = new THREE.Mesh(
            new THREE.CylinderGeometry(0.09, 0.09, 0.82, 8, 1, true),
            new THREE.MeshBasicMaterial({
                color: 0xffd467,
                transparent: true,
                opacity: 0.28,
                side: THREE.DoubleSide,
                depthWrite: false,
                blending: THREE.AdditiveBlending,
            })
        );
        mesh.add(aura);
    }

    positionOnCylinder(mesh, e.theta, e.y, CYLINDER_RADIUS + 0.3);
    return mesh;
}

function positionOnCylinder(mesh, theta, y, r) {
    mesh.position.set(
        r * Math.cos(theta),
        y,
        r * Math.sin(theta)
    );
    mesh.rotation.y = -theta + Math.PI / 2;
}

function buildPlayer() {
    if (playerMesh) scene.remove(playerMesh);
    if (playerGlow) scene.remove(playerGlow);

    // Player body — small glowing humanoid silhouette.
    const bodyGeo = new THREE.BoxGeometry(PLAYER_SIZE * 0.8, PLAYER_SIZE * 1.2, PLAYER_SIZE * 0.6);
    const bodyMat = new THREE.MeshStandardMaterial({
        color: 0x71f7ff,
        emissive: 0x2ad2e9,
        emissiveIntensity: 0.55,
        metalness: 0.24,
        roughness: 0.18,
    });
    playerMesh = new THREE.Mesh(bodyGeo, bodyMat);

    // Add a small head.
    const headGeo = new THREE.SphereGeometry(PLAYER_SIZE * 0.3, 6, 6);
    const headMat = bodyMat.clone();
    headMat.emissiveIntensity = 0.6;
    const headMesh = new THREE.Mesh(headGeo, headMat);
    headMesh.position.y = PLAYER_SIZE * 0.9;
    playerMesh.add(headMesh);
    scene.add(playerMesh);

    // Player glow shell.
    const glowGeo = new THREE.SphereGeometry(PLAYER_SIZE * 0.6, 8, 8);
    const glowMat = new THREE.MeshBasicMaterial({
        color: 0x00ffff,
        transparent: true,
        opacity: 0.12,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
    });
    playerGlow = new THREE.Mesh(glowGeo, glowMat);
    scene.add(playerGlow);

    // Trail particles.
    const trailGeo = new THREE.BufferGeometry();
    const trailPositions = new Float32Array(60 * 3);
    trailGeo.setAttribute('position', new THREE.Float32BufferAttribute(trailPositions, 3));
    const trailMat = new THREE.PointsMaterial({
        color: 0x72f5ff,
        size: 0.085,
        transparent: true,
        opacity: 0.3,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
    });
    playerTrail = new THREE.Points(trailGeo, trailMat);
    scene.add(playerTrail);
}

// Trail state
const trailPositions = [];
const MAX_TRAIL = 60;

function updateTrail() {
    const r = CYLINDER_RADIUS + PLATFORM_DEPTH + PLAYER_SIZE * 0.5;
    const px = r * Math.cos(player.theta);
    const pz = r * Math.sin(player.theta);

    trailPositions.unshift({ x: px, y: player.y, z: pz });
    if (trailPositions.length > MAX_TRAIL) trailPositions.pop();

    const attr = playerTrail.geometry.attributes.position;
    for (let i = 0; i < MAX_TRAIL; i++) {
        if (i < trailPositions.length) {
            attr.setXYZ(i, trailPositions[i].x, trailPositions[i].y, trailPositions[i].z);
        } else {
            attr.setXYZ(i, 0, -100, 0);
        }
    }
    attr.needsUpdate = true;
}

// ─── Game Logic ───
function resetGame() {
    player.theta = 0;
    player.y = 0.5 + PLATFORM_THICKNESS / 2 + 0.05; // on top of first platform (y=0.5)
    player.vy = 0;
    player.jumpsUsed = 0;
    player.direction = -1; // CCW = left-to-right visually
    player.grounded = true;
    player.ducking = false;
    player.isDead = false;
    score = 0;
    lives = LIVES_MAX;
    energy = ENERGY_MAX;
    maxHeight = 0;
    currentZone = 0;
    dashTimer = 0;
    dashCooldownTimer = 0;
    isDashing = false;
    coyoteTimer = 0;
    speedMultiplier = 1;
    hitInvulnTimer = 0;
    lastSafeGroundHeight = player.y;
    fallOffBaseY = player.y;
    airborneSinceGround = 0;
    checkpoint.platformIndex = 0;
    checkpoint.theta = player.theta;
    checkpoint.y = player.y;
    checkpoint.valid = false;
    trailPositions.length = 0;

    platformStates = [];
    enemyStates = [];
    collectibleStates = [];

    buildTower();
    setCheckpointFromPlatform(0);
    if (!checkpoint.valid) {
        const fallback = getRespawnPoint();
        checkpoint.platformIndex = fallback.platformIndex;
        checkpoint.theta = fallback.theta;
        checkpoint.y = fallback.y;
        checkpoint.valid = true;
    }
    lastSafeGroundHeight = checkpoint.y;
    applyZoneVisuals(0, true);
    updateHUD();
}

function wrapAngle(a) {
    return ((a % PI2) + PI2) % PI2;
}

function angleDist(a, b) {
    let d = Math.abs(wrapAngle(a) - wrapAngle(b));
    return d > Math.PI ? PI2 - d : d;
}

function platformTopY(platform) {
    return platform.y + PLATFORM_THICKNESS / 2 + 0.05;
}

function isStableCheckpointPlatform(platform) {
    return platform.type === 'solid' || platform.type === 'bouncy' || platform.type === 'conveyor';
}

function setCheckpointFromPlatform(platformIndex) {
    const platform = platformStates[platformIndex];
    if (!platform || platform.destroyed || !platform.visible || !isStableCheckpointPlatform(platform)) return false;

    checkpoint.platformIndex = platformIndex;
    checkpoint.theta = platform.theta;
    checkpoint.y = platformTopY(platform);
    checkpoint.valid = true;
    return true;
}

function getRespawnPoint() {
    if (checkpoint.valid) {
        const cp = platformStates[checkpoint.platformIndex];
        if (cp && !cp.destroyed && cp.visible) {
            return {
                platformIndex: checkpoint.platformIndex,
                theta: cp.theta,
                y: platformTopY(cp),
            };
        }
    }

    const targetCeiling = Math.max(maxHeight, player.y) + 0.5;
    let bestStable = null;
    let bestAny = null;

    for (let i = 0; i < platformStates.length; i++) {
        const p = platformStates[i];
        if (p.destroyed || !p.visible) continue;

        const topY = platformTopY(p);
        if (topY > targetCeiling) continue;

        const candidate = { platformIndex: i, theta: p.theta, y: topY };
        if (!bestAny || topY > bestAny.y) bestAny = candidate;
        if (isStableCheckpointPlatform(p) && (!bestStable || topY > bestStable.y)) {
            bestStable = candidate;
        }
    }

    return bestStable || bestAny || {
        platformIndex: 0,
        theta: 0,
        y: 0.5 + PLATFORM_THICKNESS / 2 + 0.05,
    };
}

function debugDeathLog(event, payload = {}) {
    if (!DEBUG_DEATH_LOGS) return;
    console.info(`[NeonSpire] ${event}`, payload);
}

function formatDeathReason(reason) {
    switch (reason) {
        case 'fall_off_platform':
        case 'fall':
            return 'Fell off platform';
        case 'enemy':
            return 'Enemy collision';
        default:
            return 'Unknown';
    }
}

function updatePlayerMesh() {
    const r = CYLINDER_RADIUS + PLATFORM_DEPTH + PLAYER_SIZE * 0.5;
    const scaleY = player.ducking ? 0.5 : 1.0;
    playerMesh.scale.y = scaleY;
    const halfH = (PLAYER_SIZE * 1.5 * scaleY) / 2;
    const playerVisualY = player.y + halfH;
    playerMesh.position.set(
        r * Math.cos(player.theta),
        playerVisualY,
        r * Math.sin(player.theta)
    );
    playerMesh.rotation.y = -player.theta + Math.PI / 2;

    playerGlow.position.set(
        r * Math.cos(player.theta),
        playerVisualY,
        r * Math.sin(player.theta)
    );

    if (playerLight) {
        playerLight.position.set(
            r * Math.cos(player.theta),
            playerVisualY + 0.2,
            r * Math.sin(player.theta)
        );
    }

    const headMat = playerMesh.children[0].material;

    if (isDashing) {
        playerMesh.material.color.setHex(0xffffff);
        playerMesh.material.emissive.setHex(0x8adfff);
        playerMesh.material.emissiveIntensity = 1.1;
        headMat.color.setHex(0xffffff);
        headMat.emissive.setHex(0x8adfff);
        headMat.emissiveIntensity = 1.15;
        playerGlow.material.opacity = 0.32;
        playerGlow.scale.set(2.2, 1.6, 2.2);
        if (playerLight) playerLight.intensity = 1.2;
    } else {
        playerMesh.material.color.setHex(0x71f7ff);
        playerMesh.material.emissive.setHex(0x2ad2e9);
        playerMesh.material.emissiveIntensity = 0.55;
        headMat.color.setHex(0x71f7ff);
        headMat.emissive.setHex(0x2ad2e9);
        headMat.emissiveIntensity = 0.6;
        playerGlow.material.opacity = 0.12;
        playerGlow.scale.set(1, 1, 1);
        if (playerLight) playerLight.intensity = 0.85;
    }
}

function updatePlayer(dt) {
    if (player.isDead) return;

    hitInvulnTimer = Math.max(0, hitInvulnTimer - dt);
    enemyContactLogTimer = Math.max(0, enemyContactLogTimer - dt);

    // Speed ramps up: slow start, faster with height
    speedMultiplier = 0.5 + player.y * 0.02;
    speedMultiplier = Math.min(speedMultiplier, 1.5);

    // Dash
    if (isDashing) {
        dashTimer -= dt;
        if (dashTimer <= 0) {
            isDashing = false;
        }
    }

    dashCooldownTimer = Math.max(0, dashCooldownTimer - dt);

    // Energy regen
    energy = Math.min(ENERGY_MAX, energy + ENERGY_REGEN * dt);

    // Handle input
    input.update();

    if (input.actions.reverse) {
        player.direction *= -1;
        audio.playReverse();
    }

    if (input.actions.duck) {
        player.ducking = true;
    } else {
        player.ducking = input.keys['KeyS'] || false;
    }

    // Dash (zone 3+)
    if (input.actions.dash && currentZone >= 2 && !isDashing && dashCooldownTimer <= 0 && energy >= DASH_COST) {
        isDashing = true;
        dashTimer = DASH_DURATION;
        dashCooldownTimer = DASH_COOLDOWN;
        energy -= DASH_COST;
        audio.playDash();
    }

    // Jump and double-jump use the same input.
    const canGroundJump = player.grounded || coyoteTimer > 0;
    if (input.actions.jump) {
        if (canGroundJump) {
            player.vy = JUMP_VELOCITY;
            player.grounded = false;
            player.jumpsUsed = 1;
            coyoteTimer = 0;
            audio.playJump();
        } else if (player.jumpsUsed === 1 && energy >= DOUBLE_JUMP_COST) {
            player.vy = DOUBLE_JUMP_VELOCITY;
            player.jumpsUsed = 2;
            energy -= DOUBLE_JUMP_COST;
            audio.playJump();
        }
    }

    // Move around cylinder
    const speed = isDashing ? BASE_SPEED * DASH_SPEED_MULT : BASE_SPEED;
    player.theta += speed * speedMultiplier * player.direction * dt;
    player.theta = wrapAngle(player.theta);

    // Gravity
    if (!player.grounded) {
        player.vy += GRAVITY * dt;
    }
    player.y += player.vy * dt;

    // Coyote time
    if (player.grounded) {
        coyoteTimer = COYOTE_TIME;
    } else {
        coyoteTimer -= dt;
    }

    // Platform collision
    player.grounded = false;
    if (player.vy <= 0) { // only check collision when falling
        for (let i = 0; i < platformStates.length; i++) {
            const p = platformStates[i];
            if (p.destroyed || !p.visible) continue;

            const angDist = angleDist(player.theta, p.theta);
            const halfWidth = p.width / 2 + LANDING_ANGLE_PADDING;

            if (angDist < halfWidth) {
                const platTop = p.y + PLATFORM_THICKNESS / 2;
                const platBot = p.y - PLATFORM_THICKNESS / 2;

                // Landing on top — allow a small tolerance so visual contact feels reliable.
                if (player.y <= platTop + LANDING_TOP_BUFFER && player.y >= platBot - LANDING_BOTTOM_BUFFER) {
                    player.y = platTop + 0.05;
                    player.grounded = true;
                    player.jumpsUsed = 0;
                    lastSafeGroundHeight = Math.max(lastSafeGroundHeight, player.y);
                    if (isStableCheckpointPlatform(p)) {
                        setCheckpointFromPlatform(i);
                    }

                    // Platform-specific behavior
                    switch (p.type) {
                        case 'bouncy':
                            player.vy = BOUNCE_VELOCITY;
                            player.grounded = false;
                            player.jumpsUsed = 1;
                            audio.playJump();
                            break;
                        case 'crumbling':
                            if (p.crumbleTimer < 0) {
                                p.crumbleTimer = CRUMBLE_FUSE_TIME;
                                audio.playCrumble();
                            }
                            break;
                        case 'conveyor':
                            player.theta += (p.conveyorSpeed || 1.0) * dt;
                            player.theta = wrapAngle(player.theta);
                            break;
                    }

                    if (p.type !== 'bouncy') {
                        player.vy = 0;
                        if (!p._landed) {
                            audio.playLand();
                            p._landed = true;
                        }
                    }
                    break;
                }
            } else {
                if (p._landed) p._landed = false;
            }
        }
    }

    if (player.grounded) {
        fallOffBaseY = player.y;
        airborneSinceGround = 0;
    } else {
        airborneSinceGround += dt;
    }

    // Check for collectibles
    for (let i = 0; i < collectibleStates.length; i++) {
        const c = collectibleStates[i];
        if (c.collected) continue;
        const dist = angleDist(player.theta, c.theta);
        const yDist = Math.abs(player.y - c.y);
        if (dist < 0.3 && yDist < 0.5) {
            c.collected = true;
            score += c.value;
            collectibleMeshes[i].visible = false;
            audio.playCollectible();
        }
    }

    // Enemy contact can be logged without dealing damage.
    if (!isDashing) {
        for (let i = 0; i < enemyStates.length; i++) {
            const e = enemyStates[i];
            if (!e.active) continue;

            let enemyTheta = e.theta;
            let enemyY = e.y;
            const dist = angleDist(player.theta, enemyTheta);
            const yDist = Math.abs(player.y - enemyY);

            let hitRadius = 0.35;
            if (e.type === 'zapper' && e._zapActive) {
                hitRadius = e.arcSpan / 2;
            } else if (e.type === 'zapper' && !e._zapActive) {
                continue;
            }

            if (dist < hitRadius && yDist < 0.5) {
                if (ENABLE_ENEMY_DAMAGE && hitInvulnTimer <= 0) {
                    playerHit('enemy', {
                        enemyType: e.type,
                        enemyIndex: i,
                        playerY: Number(player.y.toFixed(2)),
                        playerTheta: Number(player.theta.toFixed(2)),
                    });
                } else if (enemyContactLogTimer <= 0) {
                    debugDeathLog('Enemy contact ignored (damage disabled)', {
                        enemyType: e.type,
                        enemyIndex: i,
                        playerY: Number(player.y.toFixed(2)),
                        playerTheta: Number(player.theta.toFixed(2)),
                    });
                    enemyContactLogTimer = 0.75;
                }
                break;
            }
        }
    }

    // Height tracking & scoring
    if (player.y > maxHeight) {
        score += Math.floor((player.y - maxHeight) * 10);
        maxHeight = player.y;
    }

    // Zone detection
    const newZone = Math.min(2, Math.floor(player.y / 20));
    if (newZone > currentZone) {
        currentZone = newZone;
        announceZone(currentZone);
        audio.playZoneTransition();
    }

    // Consistent fall rule: lose a life when descending enough below the last grounded platform.
    const fallDrop = fallOffBaseY - player.y;
    if (
        hitInvulnTimer <= 0 &&
        !player.grounded &&
        player.vy < -0.15 &&
        airborneSinceGround >= FALL_OFF_GRACE_TIME &&
        fallDrop >= FALL_OFF_DROP_FOR_LIFE
    ) {
        playerHit('fall_off_platform', {
            playerY: Number(player.y.toFixed(2)),
            playerVY: Number(player.vy.toFixed(2)),
            fallOffBaseY: Number(fallOffBaseY.toFixed(2)),
            fallDrop: Number(fallDrop.toFixed(2)),
            airborneTime: Number(airborneSinceGround.toFixed(2)),
        });
    }

    // Victory condition
    if (player.y >= TOWER_HEIGHT - 1) {
        victory();
    }

    updatePlayerMesh();
    updateTrail();
}

function playerHit(reason = 'unknown', details = {}) {
    if (state !== 'playing' || hitInvulnTimer > 0) return;

    debugDeathLog('Player hit', {
        reason,
        livesBefore: lives,
        playerY: Number(player.y.toFixed(2)),
        playerTheta: Number(player.theta.toFixed(2)),
        zone: currentZone + 1,
        ...details,
    });

    lives--;
    audio.playDeath();
    if (lives <= 0) {
        die(reason);
    } else {
        const respawn = getRespawnPoint();
        checkpoint.platformIndex = respawn.platformIndex;
        checkpoint.theta = respawn.theta;
        checkpoint.y = respawn.y;
        checkpoint.valid = true;

        player.theta = respawn.theta;
        player.y = respawn.y;
        player.vy = 0;
        player.grounded = true;
        player.jumpsUsed = 0;
        player.ducking = false;
        coyoteTimer = COYOTE_TIME;
        lastSafeGroundHeight = player.y;
        fallOffBaseY = player.y;
        airborneSinceGround = 0;
        hitInvulnTimer = RESPAWN_INVULN_TIME;

        // i-frames without speed burst to avoid unfair launch after respawn.
        isDashing = false;
        dashTimer = 0;
        trailPositions.length = 0;
        updatePlayerMesh();
        updateTrail();
        debugDeathLog('Respawn', {
            reason,
            livesAfter: lives,
            respawnY: Number(player.y.toFixed(2)),
            respawnTheta: Number(player.theta.toFixed(2)),
            checkpointIndex: checkpoint.platformIndex,
        });
    }
    updateHUD();
}

function die(reason = 'unknown') {
    state = 'dead';
    player.isDead = true;
    audio.stopMusic();
    document.getElementById('death-screen').classList.remove('hidden');
    document.getElementById('hud').classList.add('hidden');
    document.getElementById('death-score').textContent = score;
    document.getElementById('death-height').textContent = Math.floor(maxHeight);
    const causeEl = document.getElementById('death-cause');
    if (causeEl) causeEl.textContent = formatDeathReason(reason);
    debugDeathLog('Player died (game over)', {
        reason,
        score,
        maxHeight: Number(maxHeight.toFixed(2)),
    });
}

function victory() {
    state = 'victory';
    audio.stopMusic();
    document.getElementById('victory-screen').classList.remove('hidden');
    document.getElementById('hud').classList.add('hidden');
    document.getElementById('victory-score').textContent = score;
}

function updatePlatforms(dt) {
    const now = performance.now() * 0.001;

    for (let i = 0; i < platformStates.length; i++) {
        const p = platformStates[i];
        const meshGroup = platformMeshes[i];
        const mainMat = meshGroup.userData.mainMaterial || meshGroup.children[0].material;
        const edgeMat = meshGroup.userData.edgeMaterial || meshGroup.children[1].material;

        if (p.destroyed) {
            meshGroup.visible = false;
            continue;
        }

        const ambientPulse = 0.5 + Math.sin(now * 2.8 + meshGroup.userData.phase) * 0.5;
        edgeMat.opacity = 0.25 + ambientPulse * 0.35;
        if (mainMat.emissiveIntensity !== undefined) {
            mainMat.emissiveIntensity = 0.2 + ambientPulse * 0.2;
        }

        switch (p.type) {
            case 'crumbling':
                if (p.crumbleTimer >= 0) {
                    p.crumbleTimer -= dt;
                    if (p.crumbleTimer <= 0) {
                        p.destroyed = true;
                        p.visible = false;
                        meshGroup.visible = false;
                        meshGroup.position.y = p.y;
                        break;
                    }

                    // Keep visual and collision fully aligned during fuse time.
                    p.visible = true;
                    meshGroup.visible = true;
                    const warning = 1 - (p.crumbleTimer / CRUMBLE_FUSE_TIME);
                    meshGroup.position.y = p.y;
                    mainMat.emissiveIntensity = 0.35 + warning * 0.45;
                    edgeMat.opacity = 0.35 + warning * 0.45;
                } else {
                    p.visible = true;
                    meshGroup.visible = true;
                    meshGroup.position.y = p.y;
                }
                break;
            case 'moving':
                p.theta = p.originalTheta + Math.sin(performance.now() * 0.001 * (p.moveSpeed || 1)) * (p.moveRange || 0.5);
                // Reposition the group on the cylinder.
                const mvR = CYLINDER_RADIUS + PLATFORM_DEPTH / 2;
                meshGroup.position.set(
                    mvR * Math.cos(p.theta),
                    p.y,
                    mvR * Math.sin(p.theta)
                );
                meshGroup.rotation.y = -p.theta + Math.PI / 2;
                break;
            case 'phasing':
                p.phaseTimer += dt * (p.phaseSpeed || 1.5);
                const alpha = (Math.sin(p.phaseTimer) + 1) / 2;
                p.visible = alpha > 0.3;
                meshGroup.visible = p.visible;
                mainMat.opacity = 0.2 + alpha * 0.8;
                mainMat.emissiveIntensity = 0.08 + alpha * 0.45;
                edgeMat.opacity = 0.1 + alpha * 0.55;
                break;
            case 'conveyor':
                // Animate conveyor color pulse.
                const pulse = (Math.sin(now * 7 + i) + 1) / 2;
                mainMat.color.copy(meshGroup.userData.baseColor).lerp(conveyorHighlightColor, pulse * 0.45);
                mainMat.emissive.copy(meshGroup.userData.baseEmissive).lerp(conveyorHighlightColor, pulse * 0.3);
                mainMat.emissiveIntensity = 0.22 + pulse * 0.3;
                break;
        }
    }
}

function updateEnemies(dt) {
    for (let i = 0; i < enemyStates.length; i++) {
        const e = enemyStates[i];
        const mesh = enemyMeshes[i];
        const mat = mesh.material;
        e.timer += dt;

        switch (e.type) {
            case 'sentinel':
                e.theta = e.originalTheta + Math.sin(e.timer * 1.5) * (e.patrolWidth || 0.5);
                positionOnCylinder(mesh, e.theta, e.y + 0.25, CYLINDER_RADIUS + 0.3);
                mat.emissiveIntensity = 0.42 + Math.sin(e.timer * 5 + i) * 0.12;
                break;
            case 'orbiter':
                e.theta = e.originalTheta + e.timer * (e.orbitSpeed || 1.5);
                positionOnCylinder(mesh, e.theta, e.y, CYLINDER_RADIUS + 0.5);
                mesh.rotation.y += dt * 2.2;
                mat.emissiveIntensity = 0.5 + Math.sin(e.timer * 6 + i) * 0.15;
                break;
            case 'zapper':
                const cycle = (e.onTime || 1.5) + (e.offTime || 1.5);
                const phase = e.timer % cycle;
                e._zapActive = phase < (e.onTime || 1.5);
                mesh.visible = e._zapActive;
                if (e._zapActive) {
                    // Pulse harder when active.
                    const brightness = 0.5 + Math.sin(e.timer * 20) * 0.5;
                    mat.color.copy(mesh.userData.baseColor).lerp(enemyWarnColor, brightness * 0.5);
                    mat.emissive.copy(mesh.userData.baseColor).lerp(enemyWarnColor, brightness * 0.5);
                    mat.emissiveIntensity = 0.75 + brightness * 0.55;
                    mesh.scale.y = 0.92 + brightness * 0.16;
                    if (mesh.children[0]) {
                        mesh.children[0].material.opacity = 0.24 + brightness * 0.45;
                    }
                } else if (mesh.children[0]) {
                    mesh.scale.y = 1;
                    mesh.children[0].material.opacity = 0.12;
                    mat.emissiveIntensity = 0.2;
                }
                positionOnCylinder(mesh, e.theta, e.y, CYLINDER_RADIUS + 0.1);
                break;
        }
    }
}

function updateCamera() {
    // Camera slightly above player, looking straight on
    const targetY = player.y + 1.0;
    camera.position.y += (targetY - camera.position.y) * 0.06;

    // Camera directly in front of the player (same theta, no offset)
    const camAngle = player.theta;
    const camR = 10;
    const targetX = camR * Math.cos(camAngle);
    const targetZ = camR * Math.sin(camAngle);
    camera.position.x += (targetX - camera.position.x) * 0.06;
    camera.position.z += (targetZ - camera.position.z) * 0.06;

    // Look at player on cylinder surface, slightly up to see next platform
    const lookR = CYLINDER_RADIUS + PLATFORM_DEPTH * 0.5;
    const lookX = lookR * Math.cos(player.theta);
    const lookZ = lookR * Math.sin(player.theta);
    camera.lookAt(lookX, player.y + 1.0, lookZ);
}

function updateIntroCamera(time) {
    // Cinematic fly-around: start at the TOP, spiral DOWN to start position
    const t = introTimer;
    const duration = 4.0; // seconds
    const progress = Math.min(t / duration, 1);
    // Ease-out for smooth deceleration
    const eased = 1 - Math.pow(1 - progress, 2);

    // Start high, spiral down to player start
    const angle = eased * Math.PI * 2;
    const startHeight = TOWER_HEIGHT + 5;
    const endHeight = player.y + 1.5;
    const height = startHeight + (endHeight - startHeight) * eased;
    const startRadius = 14;
    const endRadius = 10;
    const radius = startRadius + (endRadius - startRadius) * eased;

    camera.position.x = radius * Math.cos(angle);
    camera.position.z = radius * Math.sin(angle);
    camera.position.y = height;

    // Look at tower at current height level
    camera.lookAt(0, height * 0.6, 0);

    if (progress >= 1) {
        // Transition to countdown
        state = 'countdown';
        countdownTimer = 0;
        countdownNumber = 3;
        showCountdown(3);
    }
}

function updateCountdown(dt) {
    countdownTimer += dt;

    // Camera settles into gameplay position (matching updateCamera)
    const camAngle = player.theta;
    const r = 10;
    const targetX = r * Math.cos(camAngle);
    const targetZ = r * Math.sin(camAngle);
    camera.position.x += (targetX - camera.position.x) * 0.1;
    camera.position.z += (targetZ - camera.position.z) * 0.1;
    camera.position.y += (player.y + 1.0 - camera.position.y) * 0.1;
    const lookR = CYLINDER_RADIUS + PLATFORM_DEPTH * 0.5;
    camera.lookAt(lookR * Math.cos(player.theta), player.y + 1.0, lookR * Math.sin(player.theta));

    if (countdownTimer >= 1.0 && countdownNumber === 3) {
        countdownNumber = 2;
        showCountdown(2);
    } else if (countdownTimer >= 2.0 && countdownNumber === 2) {
        countdownNumber = 1;
        showCountdown(1);
    } else if (countdownTimer >= 3.0 && countdownNumber === 1) {
        countdownNumber = 0;
        showCountdown(0); // "CLIMB!"
    } else if (countdownTimer >= 3.5 && countdownNumber === 0) {
        state = 'playing';
        hideCountdown();
        audio.startMusic();
        announceZone(0);
    }
}

function showCountdown(n) {
    const el = document.getElementById('zone-announcement');
    el.textContent = n > 0 ? n.toString() : 'CLIMB!';
    el.classList.add('show');
    if (n === 0) {
        el.style.color = '#0f0';
        el.style.textShadow = '0 0 8px #0f0, 0 0 16px #0f0';
    } else {
        el.style.color = '';
        el.style.textShadow = '';
    }
}

function hideCountdown() {
    const el = document.getElementById('zone-announcement');
    el.classList.remove('show');
    el.style.color = '';
    el.style.textShadow = '';
}

function applyZoneVisuals(zone, immediate = false) {
    const v = ZONE_VISUALS[Math.max(0, Math.min(ZONE_VISUALS.length - 1, zone))];

    targetVisualFog.setHex(v.fog);
    targetVisualBackground.setHex(v.background);
    targetBloomStrength = v.bloom;
    targetExposure = v.exposure;

    if (gridPlane) gridPlane.material.color.setHex(v.grid);
    if (towerWireframe) towerWireframe.material.color.setHex(v.wire);
    if (towerMesh) towerMesh.material.emissive.setHex(v.towerEmissive);

    if (ambientLight) ambientLight.color.setHex(v.ambient);
    if (keyLight) keyLight.color.setHex(v.keyLight);
    if (fillLight) fillLight.color.setHex(v.fillLight);
    if (playerLight) playerLight.color.setHex(v.keyLight);
    if (hemiLight) hemiLight.color.setHex(v.keyLight);

    towerRings.forEach((ring, i) => {
        ring.material.color.setHex(v.keyLight);
        if (i % 2 === 1) ring.material.color.offsetHSL(0.04, 0, 0);
    });

    if (immediate) {
        currentVisualFog.copy(targetVisualFog);
        currentVisualBackground.copy(targetVisualBackground);
        scene.fog.color.copy(currentVisualFog);
        scene.background.copy(currentVisualBackground);
        bloomPass.strength = targetBloomStrength;
        renderer.toneMappingExposure = targetExposure;
    }
}

function updateVisualAtmosphere(dt, time) {
    const lerpAmount = Math.min(1, dt * 3.2);
    currentVisualFog.lerp(targetVisualFog, lerpAmount);
    currentVisualBackground.lerp(targetVisualBackground, lerpAmount * 0.85);
    scene.fog.color.copy(currentVisualFog);
    scene.background.copy(currentVisualBackground);

    bloomPass.strength += (targetBloomStrength - bloomPass.strength) * lerpAmount;
    renderer.toneMappingExposure += (targetExposure - renderer.toneMappingExposure) * lerpAmount;

    const t = time * 0.001;

    if (keyLight) {
        keyLight.position.y += (player.y + 7.5 - keyLight.position.y) * 0.045;
        keyLight.intensity = 1.25 + Math.sin(t * 2.2) * 0.14;
    }
    if (fillLight) {
        fillLight.position.y += (player.y + 19 - fillLight.position.y) * 0.04;
        fillLight.intensity = 0.85 + Math.sin(t * 1.6 + 1.4) * 0.12;
    }
    if (rimLight) {
        rimLight.position.x = Math.cos(t * 0.45) * 10;
        rimLight.position.z = Math.sin(t * 0.45) * 10;
    }

    if (towerWireframe) {
        const wirePulse = 0.08 + Math.sin(t * 1.8 + currentZone) * 0.06;
        towerWireframe.material.opacity = wirePulse;
    }
    if (gridPlane) {
        gridPlane.material.opacity = 0.08 + Math.sin(t * 1.2) * 0.03;
    }

    if (starField) {
        starField.rotation.y += dt * 0.01;
        starField.material.opacity = 0.35 + Math.sin(t * 0.7) * 0.05;
    }
    if (starFieldFar) {
        starFieldFar.rotation.y -= dt * 0.005;
    }

    towerRings.forEach((ring) => {
        const pulse = 0.5 + Math.sin(t * 2.1 + ring.userData.phase) * 0.5;
        ring.material.opacity = 0.01 + pulse * 0.05;
        ring.scale.setScalar(1 + pulse * 0.03);
        ring.position.y = ring.userData.baseY + Math.sin(t * 1.2 + ring.userData.phase) * 0.12;
    });
}

// ─── HUD ───
function updateHUD() {
    document.getElementById('score-value').textContent = score;
    document.getElementById('zone-info').textContent = `ZONE ${currentZone + 1} — ${ZONES[currentZone].name}`;
    document.getElementById('energy-fill').style.width = `${energy}%`;
    document.getElementById('height-progress').style.height = `${Math.min(100, (maxHeight / TOWER_HEIGHT) * 100)}%`;

    let livesStr = '';
    for (let i = 0; i < LIVES_MAX; i++) {
        livesStr += i < lives ? '♦ ' : '◇ ';
    }
    document.getElementById('lives-display').textContent = livesStr;
}

function announceZone(zone) {
    const el = document.getElementById('zone-announcement');
    applyZoneVisuals(zone, false);
    el.textContent = `ZONE ${zone + 1} — ${ZONES[zone].name}`;
    el.style.color = ZONES[zone].color1;
    el.style.textShadow = `0 0 10px ${ZONES[zone].color1}, 0 0 18px ${ZONES[zone].color2}`;
    el.classList.add('show');
    setTimeout(() => {
        el.classList.remove('show');
        el.style.color = '';
        el.style.textShadow = '';
    }, 2000);
}

// ─── Game Loop ───
let lastTime = 0;

function gameLoop(time) {
    requestAnimationFrame(gameLoop);
    const dt = Math.min((time - lastTime) / 1000, 0.05); // cap dt
    lastTime = time;

    if (state === 'intro') {
        introTimer += dt;
        updateIntroCamera(time);
        updatePlayerMesh(); // show player on tower during intro
    } else if (state === 'countdown') {
        updateCountdown(dt);
        updatePlayerMesh(); // show player on platform during countdown
    } else if (state === 'playing') {
        updatePlayer(dt);
        updatePlatforms(dt);
        updateEnemies(dt);
        updateCamera();
        updateHUD();

        // Rotate collectibles
        collectibleMeshes.forEach((m, i) => {
            if (!collectibleStates[i].collected) {
                const spin = m.userData.value >= 100 ? 3.1 : 2.2;
                m.rotation.y += dt * spin;
                m.rotation.x += dt * 1.4;
                const bob = Math.sin(time * 0.0028 + m.userData.phase) * 0.12;
                m.position.y = m.userData.baseY + bob;
                const pulse = 1 + Math.sin(time * 0.004 + m.userData.phase) * 0.08;
                m.scale.setScalar(pulse);
                if (m.children[0]) {
                    m.children[0].rotation.y -= dt * 2.4;
                    m.children[0].rotation.x += dt * 1.9;
                    m.children[0].material.opacity = 0.16 + pulse * 0.12;
                }
            }
        });
    } else if (state === 'menu') {
        // Slow rotate camera around tower for menu background
        const menuAngle = time * 0.0003;
        camera.position.x = 12 * Math.cos(menuAngle);
        camera.position.z = 12 * Math.sin(menuAngle);
        camera.position.y = 8 + Math.sin(time * 0.0005) * 2;
        camera.lookAt(0, 6, 0);
    }

    // Grid parallax
    if (gridPlane) {
        gridPlane.position.y = -5 + (camera.position.y * 0.1);
    }

    updateVisualAtmosphere(dt, time);
    composer.render();
}

// ─── UI Events ───
function startGame() {
    audio.init();
    document.getElementById('menu-screen').classList.add('hidden');
    document.getElementById('death-screen').classList.add('hidden');
    document.getElementById('victory-screen').classList.add('hidden');
    document.getElementById('hud').classList.remove('hidden');
    const causeEl = document.getElementById('death-cause');
    if (causeEl) causeEl.textContent = 'Unknown';
    resetGame();
    updatePlayerMesh(); // position mesh immediately

    if (!hasSeenIntro) {
        // First time: cinematic intro → countdown → play
        state = 'intro';
        introTimer = 0;
        hasSeenIntro = true;
    } else {
        // Retry: quick countdown → play
        state = 'countdown';
        countdownTimer = 0;
        countdownNumber = 3;
        showCountdown(3);
        // Snap camera to player position immediately
        const camAngle = player.theta;
        camera.position.set(
            10 * Math.cos(camAngle),
            player.y + 1.0,
            10 * Math.sin(camAngle)
        );
    }
}

document.getElementById('start-btn').addEventListener('click', startGame);
document.getElementById('retry-btn').addEventListener('click', startGame);
document.getElementById('victory-btn').addEventListener('click', startGame);

// Also allow Space to start from menu
window.addEventListener('keydown', (e) => {
    if (e.code === 'Space' && state === 'menu') {
        e.preventDefault();
        startGame();
    }
    if (e.code === 'Space' && state === 'dead') {
        e.preventDefault();
        startGame();
    }
});

// ─── Resize ───
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(window.innerWidth, window.innerHeight);
    composer.setSize(window.innerWidth, window.innerHeight);
    bloomPass.setSize(window.innerWidth, window.innerHeight);
});

// ─── Init ───
buildScene();
buildTower();
buildPlayer();
applyZoneVisuals(0, true);
input.bindTouch(); // bind touch after canvas is in DOM
requestAnimationFrame(gameLoop);
