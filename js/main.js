import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { InputManager } from './input.js';
import { AudioManager } from './audio.js';
import { generateTower, ZONES, TOWER_HEIGHT } from './levels.js';

// ─── Constants ───
const CYLINDER_RADIUS = 3;
const PLATFORM_THICKNESS = 0.15;
const PLATFORM_DEPTH = 0.6;
const PLAYER_SIZE = 0.25;
const GRAVITY = -18;
const JUMP_VELOCITY = 8;
const HIGH_JUMP_VELOCITY = 12;
const BOUNCE_VELOCITY = 13;
const BASE_SPEED = 1.2; // radians/sec
const DASH_SPEED_MULT = 3.5;
const DASH_DURATION = 0.3;
const DASH_COOLDOWN = 3.0;
const ENERGY_MAX = 100;
const HIGH_JUMP_COST = 30;
const DASH_COST = 25;
const ENERGY_REGEN = 15; // per second
const COYOTE_TIME = 0.1;
const PI2 = Math.PI * 2;
const LIVES_MAX = 3;

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

// Player state (polar coords)
const player = {
    theta: 0,
    y: 1.5,
    vy: 0,
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
renderer.toneMapping = THREE.ReinhardToneMapping;
renderer.toneMappingExposure = 1.5;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x000511);
scene.fog = new THREE.FogExp2(0x000511, 0.012);

const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 200);
camera.position.set(0, 5, 10);

// Post-processing
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloomPass = new UnrealBloomPass(
    new THREE.Vector2(window.innerWidth, window.innerHeight),
    1.2, 0.4, 0.85
);
bloomPass.threshold = 0.1;
bloomPass.strength = 1.2;
bloomPass.radius = 0.4;
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
let gridPlane;

// Level data
let levelData = null;
let platformStates = []; // runtime state for crumbling etc.
let enemyStates = [];
let collectibleStates = [];

// ─── Build Scene ───
function buildScene() {
    // Starfield background
    const starGeo = new THREE.BufferGeometry();
    const starPositions = [];
    for (let i = 0; i < 2000; i++) {
        starPositions.push(
            (Math.random() - 0.5) * 200,
            (Math.random() - 0.5) * 200,
            -50 - Math.random() * 100
        );
    }
    starGeo.setAttribute('position', new THREE.Float32BufferAttribute(starPositions, 3));
    const starMat = new THREE.PointsMaterial({ color: 0xffffff, size: 0.15, transparent: true, opacity: 0.6 });
    starField = new THREE.Points(starGeo, starMat);
    scene.add(starField);

    // Grid plane below
    const gridGeo = new THREE.PlaneGeometry(200, 200, 80, 80);
    const gridMat = new THREE.MeshBasicMaterial({
        color: 0x0044aa,
        wireframe: true,
        transparent: true,
        opacity: 0.15,
    });
    gridPlane = new THREE.Mesh(gridGeo, gridMat);
    gridPlane.rotation.x = -Math.PI / 2;
    gridPlane.position.y = -5;
    scene.add(gridPlane);

    // Ambient light
    scene.add(new THREE.AmbientLight(0x112244, 0.5));

    // Point lights on tower
    const light1 = new THREE.PointLight(0x00ffff, 2, 30);
    light1.position.set(0, 10, 0);
    scene.add(light1);
    const light2 = new THREE.PointLight(0xff00ff, 1.5, 30);
    light2.position.set(0, 30, 0);
    scene.add(light2);
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

    // Tower cylinder - semi-transparent
    const towerGeo = new THREE.CylinderGeometry(CYLINDER_RADIUS - 0.05, CYLINDER_RADIUS - 0.05, TOWER_HEIGHT, 32, 64, true);
    const towerMat = new THREE.MeshBasicMaterial({
        color: 0x001133,
        transparent: true,
        opacity: 0.2,
        side: THREE.DoubleSide,
    });
    towerMesh = new THREE.Mesh(towerGeo, towerMat);
    towerMesh.position.y = TOWER_HEIGHT / 2;
    scene.add(towerMesh);

    // Tower wireframe
    const wireGeo = new THREE.CylinderGeometry(CYLINDER_RADIUS, CYLINDER_RADIUS, TOWER_HEIGHT, 24, 40, true);
    const wireMat = new THREE.MeshBasicMaterial({
        color: 0x003366,
        wireframe: true,
        transparent: true,
        opacity: 0.3,
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
        const geo = new THREE.OctahedronGeometry(0.12, 0);
        const mat = new THREE.MeshBasicMaterial({
            color: c.value >= 100 ? 0xffaa00 : (c.value >= 50 ? 0xff00ff : 0x00ffff),
        });
        const mesh = new THREE.Mesh(geo, mat);
        positionOnCylinder(mesh, c.theta, c.y, CYLINDER_RADIUS + 0.3);
        collectibleMeshes.push(mesh);
        scene.add(mesh);
        collectibleStates.push({ ...c, collected: false });
    });
}

function createPlatformMesh(p) {
    const angularWidth = p.width;
    const segments = Math.max(6, Math.floor(angularWidth * 10));
    const outerR = CYLINDER_RADIUS + PLATFORM_DEPTH;
    const innerR = CYLINDER_RADIUS + 0.02;

    // Wrap thetaStart to [0, 2π] for CylinderGeometry
    const thetaStart = ((p.theta - angularWidth / 2) % PI2 + PI2) % PI2;

    // Create a curved platform using CylinderGeometry segment
    const geo = new THREE.CylinderGeometry(
        outerR, outerR, PLATFORM_THICKNESS, segments, 1, true,
        thetaStart, angularWidth
    );

    let color;
    switch (p.type) {
        case 'solid': color = 0x00ffff; break;
        case 'crumbling': color = 0x888800; break;
        case 'bouncy': color = 0xff00ff; break;
        case 'moving': color = 0x00ff88; break;
        case 'phasing': color = 0x4444ff; break;
        case 'conveyor': color = 0xff8800; break;
        default: color = 0x00ffff;
    }

    const mat = new THREE.MeshBasicMaterial({
        color,
        transparent: p.type === 'phasing',
        opacity: p.type === 'phasing' ? 0.6 : 1.0,
        side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.y = p.y;

    // Add a glowing edge on top
    const edgeGeo = new THREE.CylinderGeometry(
        outerR + 0.02, outerR + 0.02, 0.02, segments, 1, true,
        thetaStart, angularWidth
    );
    const edgeMat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.6, side: THREE.DoubleSide });
    const edge = new THREE.Mesh(edgeGeo, edgeMat);
    edge.position.y = PLATFORM_THICKNESS / 2;
    mesh.add(edge);

    return mesh;
}

function createEnemyMesh(e) {
    let geo, mat;
    switch (e.type) {
        case 'sentinel':
            geo = new THREE.BoxGeometry(0.3, 0.3, 0.3);
            mat = new THREE.MeshBasicMaterial({ color: 0xff0000 });
            break;
        case 'orbiter':
            geo = new THREE.SphereGeometry(0.2, 8, 8);
            mat = new THREE.MeshBasicMaterial({ color: 0xff4400 });
            break;
        case 'zapper':
            geo = new THREE.CylinderGeometry(0.05, 0.05, 0.8, 8);
            mat = new THREE.MeshBasicMaterial({ color: 0xffff00 });
            break;
        default:
            geo = new THREE.BoxGeometry(0.25, 0.25, 0.25);
            mat = new THREE.MeshBasicMaterial({ color: 0xff0000 });
    }
    const mesh = new THREE.Mesh(geo, mat);
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

    // Player body
    const geo = new THREE.BoxGeometry(PLAYER_SIZE, PLAYER_SIZE * 1.5, PLAYER_SIZE);
    const mat = new THREE.MeshBasicMaterial({ color: 0x00ffff });
    playerMesh = new THREE.Mesh(geo, mat);
    scene.add(playerMesh);

    // Player glow
    const glowGeo = new THREE.SphereGeometry(PLAYER_SIZE * 1.2, 8, 8);
    const glowMat = new THREE.MeshBasicMaterial({
        color: 0x00ffff,
        transparent: true,
        opacity: 0.2,
    });
    playerGlow = new THREE.Mesh(glowGeo, glowMat);
    scene.add(playerGlow);

    // Trail particles
    const trailGeo = new THREE.BufferGeometry();
    const trailPositions = new Float32Array(60 * 3);
    trailGeo.setAttribute('position', new THREE.Float32BufferAttribute(trailPositions, 3));
    const trailMat = new THREE.PointsMaterial({
        color: 0x00ffff,
        size: 0.08,
        transparent: true,
        opacity: 0.5,
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
    trailPositions.length = 0;

    platformStates = [];
    enemyStates = [];
    collectibleStates = [];

    buildTower();
    updateHUD();
}

function wrapAngle(a) {
    return ((a % PI2) + PI2) % PI2;
}

function angleDist(a, b) {
    let d = Math.abs(wrapAngle(a) - wrapAngle(b));
    return d > Math.PI ? PI2 - d : d;
}

function updatePlayer(dt) {
    if (player.isDead) return;

    // Speed increases with height
    speedMultiplier = 1 + player.y * 0.005;

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

    // Jump
    const canJump = player.grounded || coyoteTimer > 0;
    if (input.actions.jump && canJump) {
        player.vy = JUMP_VELOCITY;
        player.grounded = false;
        coyoteTimer = 0;
        audio.playJump();
    }

    if (input.actions.highJump && canJump && energy >= HIGH_JUMP_COST) {
        player.vy = HIGH_JUMP_VELOCITY;
        player.grounded = false;
        coyoteTimer = 0;
        energy -= HIGH_JUMP_COST;
        audio.playJump();
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
    for (let i = 0; i < platformStates.length; i++) {
        const p = platformStates[i];
        if (p.destroyed || !p.visible) continue;

        const angDist = angleDist(player.theta, p.theta);
        const halfWidth = p.width / 2;

        if (angDist < halfWidth) {
            const platTop = p.y + PLATFORM_THICKNESS / 2;
            const platBot = p.y - PLATFORM_THICKNESS / 2;

            // Landing on top
            if (player.vy <= 0 && player.y <= platTop + 0.5 && player.y >= platBot - 0.2) {
                player.y = platTop + 0.05; // sit clearly on top
                player.grounded = true;

                // Platform-specific behavior
                switch (p.type) {
                    case 'bouncy':
                        player.vy = BOUNCE_VELOCITY;
                        player.grounded = false;
                        audio.playJump();
                        break;
                    case 'crumbling':
                        if (p.crumbleTimer < 0) {
                            p.crumbleTimer = 0.5;
                            audio.playCrumble();
                        }
                        break;
                    case 'conveyor':
                        player.theta += (p.conveyorSpeed || 1.0) * dt;
                        player.theta = wrapAngle(player.theta);
                        break;
                }

                if (player.vy <= 0 && p.type !== 'bouncy') {
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

    // Check for enemy collision (skip if dashing - i-frames)
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
                playerHit();
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

    // Death by falling
    if (player.y < maxHeight - 8) {
        playerHit();
    }

    // Victory condition
    if (player.y >= TOWER_HEIGHT - 1) {
        victory();
    }

    // Update player mesh position - on the outer surface of the cylinder
    const r = CYLINDER_RADIUS + PLATFORM_DEPTH + PLAYER_SIZE * 0.5;
    const scaleY = player.ducking ? 0.5 : 1.0;
    playerMesh.scale.y = scaleY;
    // Player feet at player.y, center offset by half height
    const halfH = (PLAYER_SIZE * 1.5 * scaleY) / 2;
    const playerVisualY = player.y + halfH;
    playerMesh.position.set(
        r * Math.cos(player.theta),
        playerVisualY,
        r * Math.sin(player.theta)
    );
    // Face outward from cylinder
    playerMesh.rotation.y = -player.theta + Math.PI / 2;

    playerGlow.position.set(
        r * Math.cos(player.theta),
        playerVisualY,
        r * Math.sin(player.theta)
    );

    // Dash visual
    if (isDashing) {
        playerMesh.material.color.setHex(0xffffff);
        playerGlow.material.opacity = 0.5;
        playerGlow.scale.set(2, 1.5, 2);
    } else {
        playerMesh.material.color.setHex(0x00ffff);
        playerGlow.material.opacity = 0.2;
        playerGlow.scale.set(1, 1, 1);
    }

    updateTrail();
}

function playerHit() {
    lives--;
    audio.playDeath();
    if (lives <= 0) {
        die();
    } else {
        // Respawn at last safe height
        player.vy = 0;
        player.y = Math.max(1.5, maxHeight - 3);
        player.grounded = false;
        // Brief invulnerability via dash i-frames
        isDashing = true;
        dashTimer = 1.0;
    }
    updateHUD();
}

function die() {
    state = 'dead';
    player.isDead = true;
    audio.stopMusic();
    document.getElementById('death-screen').classList.remove('hidden');
    document.getElementById('hud').classList.add('hidden');
    document.getElementById('death-score').textContent = score;
    document.getElementById('death-height').textContent = Math.floor(maxHeight);
}

function victory() {
    state = 'victory';
    audio.stopMusic();
    document.getElementById('victory-screen').classList.remove('hidden');
    document.getElementById('hud').classList.add('hidden');
    document.getElementById('victory-score').textContent = score;
}

function updatePlatforms(dt) {
    for (let i = 0; i < platformStates.length; i++) {
        const p = platformStates[i];
        if (p.destroyed) {
            platformMeshes[i].visible = false;
            continue;
        }

        switch (p.type) {
            case 'crumbling':
                if (p.crumbleTimer >= 0) {
                    p.crumbleTimer -= dt;
                    // Flicker effect
                    platformMeshes[i].visible = Math.random() > 0.3;
                    if (p.crumbleTimer <= 0) {
                        p.destroyed = true;
                        platformMeshes[i].visible = false;
                    }
                }
                break;
            case 'moving':
                p.theta = p.originalTheta + Math.sin(performance.now() * 0.001 * (p.moveSpeed || 1)) * (p.moveRange || 0.5);
                // Rotate the mesh around Y axis to move it around the cylinder
                const angleDelta = p.theta - p.originalTheta;
                platformMeshes[i].rotation.y = angleDelta;
                break;
            case 'phasing':
                p.phaseTimer += dt * (p.phaseSpeed || 1.5);
                const alpha = (Math.sin(p.phaseTimer) + 1) / 2;
                p.visible = alpha > 0.3;
                platformMeshes[i].visible = p.visible;
                platformMeshes[i].material.opacity = alpha;
                break;
            case 'conveyor':
                // Animate arrow pattern (color pulse)
                const pulse = (Math.sin(performance.now() * 0.005) + 1) / 2;
                platformMeshes[i].material.color.setHSL(0.08, 1, 0.3 + pulse * 0.3);
                break;
        }
    }
}

function updateEnemies(dt) {
    for (let i = 0; i < enemyStates.length; i++) {
        const e = enemyStates[i];
        e.timer += dt;

        switch (e.type) {
            case 'sentinel':
                e.theta = e.originalTheta + Math.sin(e.timer * 1.5) * (e.patrolWidth || 0.5);
                positionOnCylinder(enemyMeshes[i], e.theta, e.y + 0.25, CYLINDER_RADIUS + 0.3);
                break;
            case 'orbiter':
                e.theta = e.originalTheta + e.timer * (e.orbitSpeed || 1.5);
                positionOnCylinder(enemyMeshes[i], e.theta, e.y, CYLINDER_RADIUS + 0.5);
                break;
            case 'zapper':
                const cycle = (e.onTime || 1.5) + (e.offTime || 1.5);
                const phase = e.timer % cycle;
                e._zapActive = phase < (e.onTime || 1.5);
                enemyMeshes[i].visible = e._zapActive;
                if (e._zapActive) {
                    // Pulse
                    const brightness = 0.5 + Math.sin(e.timer * 20) * 0.5;
                    enemyMeshes[i].material.color.setHSL(0.15, 1, brightness);
                }
                positionOnCylinder(enemyMeshes[i], e.theta, e.y, CYLINDER_RADIUS + 0.1);
                break;
        }
    }
}

function updateCamera() {
    const targetY = player.y + 2.5;
    camera.position.y += (targetY - camera.position.y) * 0.08;

    // Camera offset: behind and slightly to the side of the player
    // so the player is visible on the left side of screen (running right)
    const camOffset = 0.4; // radians behind the player's direction
    const camAngle = player.theta + camOffset;
    const camR = 9;
    const targetX = camR * Math.cos(camAngle);
    const targetZ = camR * Math.sin(camAngle);
    camera.position.x += (targetX - camera.position.x) * 0.08;
    camera.position.z += (targetZ - camera.position.z) * 0.08;

    // Look slightly ahead of the player (in movement direction)
    const lookAhead = -0.3; // radians ahead in CCW direction
    const lookAngle = player.theta + lookAhead;
    const lookR = CYLINDER_RADIUS * 0.5;
    const lookX = lookR * Math.cos(lookAngle);
    const lookZ = lookR * Math.sin(lookAngle);
    camera.lookAt(lookX, player.y + 1, lookZ);
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
    const endHeight = player.y + 3;
    const height = startHeight + (endHeight - startHeight) * eased;
    const startRadius = 14;
    const endRadius = 8;
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

    // Camera settles into gameplay position (matching updateCamera offset)
    const camAngle = player.theta + 0.4;
    const r = 9;
    const targetX = r * Math.cos(camAngle);
    const targetZ = r * Math.sin(camAngle);
    camera.position.x += (targetX - camera.position.x) * 0.1;
    camera.position.z += (targetZ - camera.position.z) * 0.1;
    camera.position.y += (player.y + 2.5 - camera.position.y) * 0.1;
    const lookAngle = player.theta - 0.3;
    const lookR = CYLINDER_RADIUS * 0.5;
    camera.lookAt(lookR * Math.cos(lookAngle), player.y + 1, lookR * Math.sin(lookAngle));

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
        el.style.textShadow = '0 0 20px #0f0, 0 0 40px #0f0';
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
    el.textContent = `ZONE ${zone + 1} — ${ZONES[zone].name}`;
    el.classList.add('show');
    setTimeout(() => el.classList.remove('show'), 2000);
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
    } else if (state === 'countdown') {
        updateCountdown(dt);
    } else if (state === 'playing') {
        updatePlayer(dt);
        updatePlatforms(dt);
        updateEnemies(dt);
        updateCamera();
        updateHUD();

        // Rotate collectibles
        collectibleMeshes.forEach((m, i) => {
            if (!collectibleStates[i].collected) {
                m.rotation.y += dt * 2;
                m.position.y = collectibleStates[i].y + Math.sin(time * 0.003 + i) * 0.1;
            }
        });

        // Animate tower wireframe glow
        const pulse = 0.2 + Math.sin(time * 0.001) * 0.1;
        towerWireframe.material.opacity = pulse;
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

    composer.render();
}

// ─── UI Events ───
function startGame() {
    audio.init();
    document.getElementById('menu-screen').classList.add('hidden');
    document.getElementById('death-screen').classList.add('hidden');
    document.getElementById('victory-screen').classList.add('hidden');
    document.getElementById('hud').classList.remove('hidden');
    resetGame();

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
        const camAngle = player.theta + 0.4;
        camera.position.set(
            9 * Math.cos(camAngle),
            player.y + 2.5,
            9 * Math.sin(camAngle)
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
    renderer.setSize(window.innerWidth, window.innerHeight);
    composer.setSize(window.innerWidth, window.innerHeight);
});

// ─── Init ───
buildScene();
buildTower();
buildPlayer();
requestAnimationFrame(gameLoop);
