// Procedural level generation with fairness constraints.
// Platform types: solid, crumbling, bouncy, moving, phasing, conveyor

const PI2 = Math.PI * 2;
const JUMP_VELOCITY = 7;
const GRAVITY_MAG = 18;
const BASE_ANGULAR_SPEED = 1.2;

function mulberry32(seed) {
    let t = seed >>> 0;
    return function rng() {
        t += 0x6D2B79F5;
        let r = Math.imul(t ^ (t >>> 15), 1 | t);
        r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
        return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
    };
}

function range(rng, min, max) {
    return min + (max - min) * rng();
}

function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}

function wrapAngle(theta) {
    return ((theta % PI2) + PI2) % PI2;
}

function weightedChoice(rng, weights) {
    let total = 0;
    for (const value of Object.values(weights)) total += value;
    let roll = rng() * total;

    for (const [key, weight] of Object.entries(weights)) {
        roll -= weight;
        if (roll <= 0) return key;
    }
    return Object.keys(weights)[0];
}

function estimateAngularSpeedAtHeight(y) {
    const speedMultiplier = clamp(0.5 + y * 0.02, 0.5, 1.5);
    return BASE_ANGULAR_SPEED * speedMultiplier;
}

function isHardType(type) {
    return type === 'crumbling' || type === 'moving' || type === 'phasing' || type === 'conveyor';
}

function jumpCost({ dy, dTheta, width, type }) {
    const typeCost = {
        solid: 0,
        bouncy: 0.12,
        crumbling: 0.42,
        moving: 0.46,
        phasing: 0.5,
        conveyor: 0.38,
    }[type] || 0;

    const dyCost = Math.max(0, dy - 0.65) * 1.05;
    const thetaCost = Math.max(0, dTheta - 0.3) * 0.95;
    const widthCost = Math.max(0, 0.95 - width) * 0.45;
    return dyCost + thetaCost + widthCost + typeCost;
}

function canReachGap({ fromY, dy, dTheta, fromWidth, toWidth, strictFactor, minGapFactor = 1 }) {
    // Solve vy*t - 0.5*g*t^2 = dy for the descending landing time.
    const discriminant = JUMP_VELOCITY * JUMP_VELOCITY - 2 * GRAVITY_MAG * dy;
    if (discriminant <= 0) return false;

    const airTime = (JUMP_VELOCITY + Math.sqrt(discriminant)) / GRAVITY_MAG;
    const angularSpeed = estimateAngularSpeedAtHeight(fromY);
    const platformAssist = (fromWidth + toWidth) * 0.34;
    const maxTheta = (angularSpeed * airTime + platformAssist + 0.06) * strictFactor;
    const apexTime = JUMP_VELOCITY / GRAVITY_MAG;
    const landingHalfWindow = toWidth / 2 + 0.08;
    const minTheta = Math.max(0, (angularSpeed * apexTime - landingHalfWindow - 0.04) * minGapFactor);
    return dTheta <= maxTheta && dTheta >= minTheta;
}

function nearestThetaAtHeight(platforms, y) {
    let best = platforms[0];
    let bestDist = Math.abs(platforms[0].y - y);
    for (let i = 1; i < platforms.length; i++) {
        const dist = Math.abs(platforms[i].y - y);
        if (dist < bestDist) {
            best = platforms[i];
            bestDist = dist;
        }
    }
    return best.theta;
}

function makePlatform(type, theta, y, width, cfg, rng) {
    const platform = { type, theta, y, width };

    if (type === 'moving') {
        platform.moveRange = range(rng, cfg.moveRange[0], cfg.moveRange[1]);
        platform.moveSpeed = range(rng, cfg.moveSpeed[0], cfg.moveSpeed[1]);
    } else if (type === 'phasing') {
        platform.phaseSpeed = range(rng, cfg.phaseSpeed[0], cfg.phaseSpeed[1]);
    } else if (type === 'conveyor') {
        const sign = rng() < 0.5 ? -1 : 1;
        platform.conveyorSpeed = sign * range(rng, cfg.conveyorSpeed[0], cfg.conveyorSpeed[1]);
    }

    return platform;
}

function chooseZoneStartTheta(cfg, rng, entryFrom) {
    if (!entryFrom) return 0;

    const startY = cfg.baseY + 0.5;
    const dy = startY - entryFrom.y;
    const thetaRange = cfg.entryThetaRange || cfg.catchThetaRange;
    const fromWidth = entryFrom.width || cfg.catchWidthRange[1];
    const toWidth = cfg.startWidth;

    for (let attempt = 0; attempt < 80; attempt++) {
        const dTheta = range(rng, thetaRange[0], thetaRange[1]);
        if (canReachGap({
            fromY: entryFrom.y,
            dy,
            dTheta,
            fromWidth,
            toWidth,
            strictFactor: Math.min(1, cfg.strictFactor + 0.03),
            minGapFactor: cfg.entryMinGapFactor ?? cfg.minGapFactor ?? 1,
        })) {
            return wrapAngle(entryFrom.theta + dTheta);
        }
    }

    const fallbackTheta = clamp((thetaRange[0] + thetaRange[1]) * 0.5, 0.18, 0.58);
    return wrapAngle(entryFrom.theta + fallbackTheta);
}

function buildZonePlatforms(cfg, rng, entryFrom = null) {
    const platforms = [];
    const typeCounts = {
        solid: 0,
        crumbling: 0,
        bouncy: 0,
        moving: 0,
        phasing: 0,
        conveyor: 0,
    };

    let y = cfg.baseY + 0.5;
    let theta = chooseZoneStartTheta(cfg, rng, entryFrom);
    let previousType = 'solid';
    let recoveryRequired = false;
    let jumpsSinceCatch = 0;
    const recentCosts = [];
    let flowDy = clamp(
        (cfg.targetTop - y) / Math.max(1, cfg.platformCount - 1),
        cfg.dyRange[0],
        cfg.dyRange[1]
    );
    let flowTheta = (cfg.thetaRange[0] + cfg.thetaRange[1]) * 0.5;

    const start = { type: 'solid', theta, y, width: cfg.startWidth };
    platforms.push(start);
    typeCounts.solid += 1;

    for (let step = 1; step < cfg.platformCount; step++) {
        const isLast = step === cfg.platformCount - 1;
        let placed = false;

        for (let attempt = 0; attempt < 140; attempt++) {
            const remainingSteps = cfg.platformCount - step;
            const remainingHeight = cfg.targetTop - y;
            const baselineDy = remainingHeight / Math.max(1, remainingSteps);

            let catchPlatform =
                recoveryRequired ||
                jumpsSinceCatch >= cfg.catchEvery;

            // Do not force recovery platforms when that would make the zone mathematically
            // unable to reach its target top height.
            if (catchPlatform) {
                const stepsAfterThis = Math.max(0, cfg.platformCount - step - 1);
                const maxHeightIfCatchNow = y + cfg.catchDyRange[1] + stepsAfterThis * cfg.dyRange[1];
                if (maxHeightIfCatchNow < cfg.targetTop - 0.05) {
                    catchPlatform = false;
                }
            }

            const dyRange = catchPlatform ? cfg.catchDyRange : cfg.dyRange;
            const stepsAfterThis = Math.max(0, cfg.platformCount - step - 1);
            const minDyNeeded = cfg.targetTop - y - stepsAfterThis * cfg.dyRange[1];
            const maxDyAllowed = cfg.targetTop - y - stepsAfterThis * cfg.catchDyRange[0];
            const dyMin = Math.max(dyRange[0], minDyNeeded);
            const dyMax = Math.min(dyRange[1], maxDyAllowed);
            if (dyMin > dyMax) {
                continue;
            }
            const dyBlend = catchPlatform ? (cfg.catchFlowBlend ?? cfg.flowBlend ?? 0.62) : (cfg.flowBlend ?? 0.62);
            const dyNoise = catchPlatform ? (cfg.catchFlowDyNoise ?? cfg.flowDyNoise ?? 0.1) : (cfg.flowDyNoise ?? 0.1);
            const dyTarget = clamp(flowDy + (baselineDy - flowDy) * dyBlend, dyMin, dyMax);
            const dy = clamp(dyTarget + range(rng, -dyNoise, dyNoise), dyMin, dyMax);

            const thetaRange = catchPlatform ? cfg.catchThetaRange : cfg.thetaRange;
            const thetaMin = thetaRange[0];
            const thetaMax = thetaRange[1];
            const thetaMid = (thetaMin + thetaMax) * 0.5;
            const thetaDrift = catchPlatform ? (cfg.catchThetaDrift ?? cfg.thetaDrift ?? 0.28) : (cfg.thetaDrift ?? 0.28);
            const thetaNoise = catchPlatform ? (cfg.catchFlowThetaNoise ?? cfg.flowThetaNoise ?? 0.12) : (cfg.flowThetaNoise ?? 0.12);
            const maxThetaStepDelta = catchPlatform ? (cfg.catchMaxThetaStepDelta ?? cfg.maxThetaStepDelta ?? 0.24) : (cfg.maxThetaStepDelta ?? 0.24);
            const thetaTarget = flowTheta + (thetaMid - flowTheta) * thetaDrift;
            const flowThetaMin = Math.max(thetaMin, flowTheta - maxThetaStepDelta);
            const flowThetaMax = Math.min(thetaMax, flowTheta + maxThetaStepDelta);
            if (flowThetaMin > flowThetaMax) {
                continue;
            }
            const dTheta = clamp(thetaTarget + range(rng, -thetaNoise, thetaNoise), flowThetaMin, flowThetaMax);

            const widthRange = catchPlatform ? cfg.catchWidthRange : cfg.widthRange;
            const widthMid = (widthRange[0] + widthRange[1]) * 0.5;
            const widthNoise = catchPlatform ? (cfg.catchFlowWidthNoise ?? cfg.flowWidthNoise ?? 0.12) : (cfg.flowWidthNoise ?? 0.12);
            const width = clamp(
                widthMid + range(rng, -widthNoise, widthNoise),
                widthRange[0],
                widthRange[1]
            );

            let type = 'solid';
            if (!isLast && !catchPlatform) {
                type = weightedChoice(rng, cfg.typeWeights);
            }

            if ((previousType === 'crumbling' || previousType === 'phasing') && type !== 'solid') {
                continue;
            }

            if (isHardType(type) && isHardType(previousType)) {
                continue;
            }

            if (cfg.maxTypeCounts[type] !== undefined && typeCounts[type] >= cfg.maxTypeCounts[type]) {
                continue;
            }

            const previous = platforms[platforms.length - 1];
            const movingPenalty = type === 'moving' ? (cfg.movingSafetyPenalty || 0) : 0;
            const strictFactor = cfg.strictFactor - (isHardType(type) ? cfg.hardStrictPenalty : 0) - movingPenalty;
            if (!canReachGap({
                fromY: y,
                dy,
                dTheta,
                fromWidth: previous.width,
                toWidth: width,
                strictFactor,
                minGapFactor: catchPlatform ? (cfg.catchMinGapFactor ?? cfg.minGapFactor ?? 1) : (cfg.minGapFactor ?? 1),
            })) {
                continue;
            }

            const cost = jumpCost({ dy, dTheta, width, type });
            const recentTotal = recentCosts.reduce((sum, v) => sum + v, 0) + cost;
            if (!catchPlatform && recentTotal > cfg.maxRecentCost) {
                continue;
            }

            y += dy;
            theta = wrapAngle(theta + dTheta);
            const platform = makePlatform(type, theta, y, width, cfg, rng);
            platforms.push(platform);

            typeCounts[type] += 1;
            recentCosts.push(cost);
            if (recentCosts.length > cfg.recentWindow) recentCosts.shift();
            const flowAdapt = catchPlatform ? (cfg.catchFlowAdapt ?? cfg.flowAdapt ?? 0.65) : (cfg.flowAdapt ?? 0.65);
            flowDy = flowDy + (dy - flowDy) * flowAdapt;
            flowTheta = flowTheta + (dTheta - flowTheta) * flowAdapt;

            recoveryRequired = type === 'crumbling' || type === 'phasing';
            jumpsSinceCatch = catchPlatform ? 0 : jumpsSinceCatch + 1;
            previousType = type;
            placed = true;
            break;
        }

        if (!placed) {
            const remainingSteps = cfg.platformCount - step;
            const fallbackDy = clamp(
                (cfg.targetTop - y) / Math.max(1, remainingSteps),
                cfg.catchDyRange[0],
                cfg.dyRange[1]
            );
            const fallbackTheta = range(rng, cfg.catchThetaRange[0], cfg.catchThetaRange[1]);
            const fallbackWidth = cfg.catchWidthRange[1];

            y += fallbackDy;
            theta = wrapAngle(theta + fallbackTheta);

            platforms.push({ type: 'solid', theta, y, width: fallbackWidth });
            typeCounts.solid += 1;
            recentCosts.push(jumpCost({
                dy: fallbackDy,
                dTheta: fallbackTheta,
                width: fallbackWidth,
                type: 'solid',
            }));
            if (recentCosts.length > cfg.recentWindow) recentCosts.shift();
            flowDy = flowDy + (fallbackDy - flowDy) * 0.7;
            flowTheta = flowTheta + (fallbackTheta - flowTheta) * 0.7;
            recoveryRequired = false;
            jumpsSinceCatch = 0;
            previousType = 'solid';
        }
    }

    const finalPlatform = platforms[platforms.length - 1];
    const yDiff = cfg.targetTop - finalPlatform.y;
    if (Math.abs(yDiff) <= 0.2) finalPlatform.y = cfg.targetTop;

    return platforms;
}

function buildZoneEnemies(cfg, platforms, rng) {
    const enemies = [];
    const thetaAt = (y, offset = 0) => wrapAngle(nearestThetaAtHeight(platforms, y) + offset);

    if (cfg.enemyProfile === 'foundation') {
        enemies.push({ type: 'sentinel', theta: thetaAt(cfg.baseY + 3.5, 0.18), y: cfg.baseY + 3.5, patrolWidth: 0.55 });
        enemies.push({ type: 'sentinel', theta: thetaAt(cfg.baseY + 7.5, -0.12), y: cfg.baseY + 7.5, patrolWidth: 0.5 });
        enemies.push({ type: 'sentinel', theta: thetaAt(cfg.baseY + 17.5, 0.16), y: cfg.baseY + 17.5, patrolWidth: 0.65 });
    } else if (cfg.enemyProfile === 'interference') {
        enemies.push({ type: 'orbiter', theta: thetaAt(cfg.baseY + 5.0), y: cfg.baseY + 5.0, orbitSpeed: 1.35 });
        enemies.push({ type: 'orbiter', theta: thetaAt(cfg.baseY + 11.0, PI2 / 2), y: cfg.baseY + 11.0, orbitSpeed: -1.1 });
        enemies.push({ type: 'orbiter', theta: thetaAt(cfg.baseY + 16.0, -PI2 / 3), y: cfg.baseY + 16.0, orbitSpeed: 1.55 });
        enemies.push({ type: 'sentinel', theta: thetaAt(cfg.baseY + 2.5), y: cfg.baseY + 2.5, patrolWidth: 0.5 });
        enemies.push({ type: 'sentinel', theta: thetaAt(cfg.baseY + 8.5, 0.12), y: cfg.baseY + 8.5, patrolWidth: 0.58 });
    } else if (cfg.enemyProfile === 'storm') {
        enemies.push({ type: 'zapper', theta: thetaAt(cfg.baseY + 4.0), y: cfg.baseY + 4.0, arcSpan: 0.6, onTime: 1.5, offTime: 1.5 });
        enemies.push({ type: 'zapper', theta: thetaAt(cfg.baseY + 9.5, PI2 / 3), y: cfg.baseY + 9.5, arcSpan: 0.78, onTime: 1.1, offTime: 1.5 });
        enemies.push({ type: 'zapper', theta: thetaAt(cfg.baseY + 14.0, -PI2 / 4), y: cfg.baseY + 14.0, arcSpan: 0.55, onTime: 1.2, offTime: 1.3 });
        enemies.push({ type: 'orbiter', theta: thetaAt(cfg.baseY + 3.0), y: cfg.baseY + 3.0, orbitSpeed: 1.9 });
        enemies.push({ type: 'orbiter', theta: thetaAt(cfg.baseY + 13.0, PI2 / 2), y: cfg.baseY + 13.0, orbitSpeed: -2.05 });
        enemies.push({ type: 'sentinel', theta: thetaAt(cfg.baseY + 2.5), y: cfg.baseY + 2.5, patrolWidth: 0.5 });
        enemies.push({ type: 'sentinel', theta: thetaAt(cfg.baseY + 16.5, -0.15), y: cfg.baseY + 16.5, patrolWidth: 0.62 });
    }

    // Slight random phase variety without hurting consistency.
    for (const enemy of enemies) {
        if (enemy.type === 'sentinel') {
            enemy.theta = wrapAngle(enemy.theta + range(rng, -0.08, 0.08));
        }
    }

    return enemies;
}

function buildZoneCollectibles(cfg, platforms, rng) {
    const collectibles = [];
    const count = cfg.collectibleCount;

    for (let i = 0; i < count; i++) {
        const progress = (i + 1) / (count + 1);
        const y = cfg.baseY + 0.8 + progress * 18.2;
        const theta = wrapAngle(nearestThetaAtHeight(platforms, y) + range(rng, -0.42, 0.42));
        collectibles.push({
            theta,
            y,
            value: cfg.collectibleValue(i),
        });
    }

    return collectibles;
}

function clonePlatform(platform) {
    if (!platform) return null;
    return {
        type: platform.type,
        theta: platform.theta,
        y: platform.y,
        width: platform.width,
    };
}

const ZONE_CONFIGS = [
    {
        name: 'FOUNDATION',
        baseY: 0,
        targetTop: 19.5,
        platformCount: 16,
        startWidth: 3.3,
        catchEvery: 4,
        dyRange: [0.98, 1.3],
        dyJitter: 0.18,
        catchDyRange: [0.72, 1.02],
        catchDyJitter: 0.12,
        flowBlend: 0.68,
        flowDyNoise: 0.06,
        flowThetaNoise: 0.08,
        flowWidthNoise: 0.1,
        maxThetaStepDelta: 0.16,
        thetaDrift: 0.32,
        flowAdapt: 0.7,
        catchFlowBlend: 0.74,
        catchFlowDyNoise: 0.05,
        catchFlowThetaNoise: 0.06,
        catchFlowWidthNoise: 0.08,
        catchMaxThetaStepDelta: 0.14,
        catchThetaDrift: 0.36,
        catchFlowAdapt: 0.72,
        minGapFactor: 0.84,
        catchMinGapFactor: 0.8,
        entryMinGapFactor: 0.82,
        thetaRange: [0.56, 0.9],
        catchThetaRange: [0.4, 0.7],
        widthRange: [0.8, 1.04],
        catchWidthRange: [0.98, 1.3],
        strictFactor: 0.94,
        hardStrictPenalty: 0.03,
        maxRecentCost: 4.35,
        recentWindow: 4,
        maxTypeCounts: { crumbling: 2, bouncy: 2, moving: 0, phasing: 0, conveyor: 0 },
        typeWeights: { solid: 0.82, bouncy: 0.14, crumbling: 0.04 },
        moveRange: [0.45, 0.8],
        moveSpeed: [0.75, 1.15],
        phaseSpeed: [1.3, 1.9],
        conveyorSpeed: [0.85, 1.2],
        collectibleCount: 15,
        collectibleValue: (i) => (i % 4 === 0 ? 50 : 10),
        enemyProfile: 'foundation',
    },
    {
        name: 'INTERFERENCE',
        baseY: 20,
        targetTop: 39.5,
        platformCount: 20,
        startWidth: 1.1,
        catchEvery: 4,
        dyRange: [0.94, 1.28],
        dyJitter: 0.2,
        catchDyRange: [0.68, 1.0],
        catchDyJitter: 0.11,
        flowBlend: 0.62,
        flowDyNoise: 0.07,
        flowThetaNoise: 0.1,
        flowWidthNoise: 0.11,
        maxThetaStepDelta: 0.2,
        thetaDrift: 0.28,
        flowAdapt: 0.66,
        catchFlowBlend: 0.68,
        catchFlowDyNoise: 0.06,
        catchFlowThetaNoise: 0.08,
        catchFlowWidthNoise: 0.09,
        catchMaxThetaStepDelta: 0.18,
        catchThetaDrift: 0.32,
        catchFlowAdapt: 0.68,
        minGapFactor: 0.94,
        catchMinGapFactor: 0.9,
        entryMinGapFactor: 0.92,
        entryThetaRange: [0.4, 0.66],
        thetaRange: [0.56, 0.94],
        catchThetaRange: [0.38, 0.76],
        widthRange: [0.7, 1.0],
        catchWidthRange: [0.88, 1.2],
        strictFactor: 0.92,
        hardStrictPenalty: 0.045,
        movingSafetyPenalty: 0.06,
        maxRecentCost: 5.15,
        recentWindow: 4,
        maxTypeCounts: { crumbling: 4, bouncy: 1, moving: 4, phasing: 0, conveyor: 1 },
        typeWeights: {
            solid: 0.52,
            crumbling: 0.21,
            moving: 0.18,
            bouncy: 0.06,
            conveyor: 0.03,
        },
        moveRange: [0.22, 0.5],
        moveSpeed: [0.75, 1.2],
        phaseSpeed: [1.35, 2.0],
        conveyorSpeed: [0.85, 1.3],
        collectibleCount: 12,
        collectibleValue: (i) => (i % 5 === 0 ? 100 : (i % 2 === 0 ? 50 : 10)),
        enemyProfile: 'interference',
    },
    {
        name: 'STORM',
        baseY: 40,
        targetTop: 59.5,
        platformCount: 20,
        startWidth: 0.95,
        catchEvery: 4,
        dyRange: [1.0, 1.28],
        dyJitter: 0.19,
        catchDyRange: [0.76, 1.06],
        catchDyJitter: 0.1,
        flowBlend: 0.6,
        flowDyNoise: 0.08,
        flowThetaNoise: 0.11,
        flowWidthNoise: 0.1,
        maxThetaStepDelta: 0.22,
        thetaDrift: 0.26,
        flowAdapt: 0.64,
        catchFlowBlend: 0.66,
        catchFlowDyNoise: 0.07,
        catchFlowThetaNoise: 0.09,
        catchFlowWidthNoise: 0.09,
        catchMaxThetaStepDelta: 0.2,
        catchThetaDrift: 0.3,
        catchFlowAdapt: 0.66,
        minGapFactor: 1.06,
        catchMinGapFactor: 1.0,
        entryMinGapFactor: 1.02,
        entryThetaRange: [0.56, 0.86],
        thetaRange: [0.72, 1.12],
        catchThetaRange: [0.54, 0.9],
        widthRange: [0.74, 1.04],
        catchWidthRange: [0.94, 1.22],
        strictFactor: 0.93,
        hardStrictPenalty: 0.05,
        movingSafetyPenalty: 0.09,
        maxRecentCost: 5.2,
        recentWindow: 4,
        maxTypeCounts: { crumbling: 4, bouncy: 1, moving: 3, phasing: 2, conveyor: 2 },
        typeWeights: {
            solid: 0.46,
            crumbling: 0.14,
            moving: 0.16,
            phasing: 0.1,
            conveyor: 0.06,
            bouncy: 0.08,
        },
        moveRange: [0.22, 0.5],
        moveSpeed: [1.0, 1.55],
        phaseSpeed: [1.35, 2.1],
        conveyorSpeed: [0.9, 1.35],
        collectibleCount: 15,
        collectibleValue: (i) => (i % 3 === 0 ? 100 : (i % 2 === 0 ? 50 : 10)),
        enemyProfile: 'storm',
    },
];

function generateZone(zoneIndex, seed = Math.floor(Math.random() * 0xFFFFFFFF), entryFrom = null) {
    const cfg = ZONE_CONFIGS[zoneIndex];
    const rng = mulberry32(seed >>> 0);

    const platforms = buildZonePlatforms(cfg, rng, entryFrom);
    const enemies = buildZoneEnemies(cfg, platforms, rng);
    const collectibles = buildZoneCollectibles(cfg, platforms, rng);

    return { platforms, enemies, collectibles, height: 20 };
}

export const ZONES = [
    { name: 'FOUNDATION', color1: '#00ffff', color2: '#0044aa', generate: (seed, entryFrom) => generateZone(0, seed, entryFrom) },
    { name: 'INTERFERENCE', color1: '#ff00ff', color2: '#440088', generate: (seed, entryFrom) => generateZone(1, seed, entryFrom) },
    { name: 'STORM', color1: '#ffaa00', color2: '#882200', generate: (seed, entryFrom) => generateZone(2, seed, entryFrom) },
];

export const TOWER_HEIGHT = 60; // Total height of the tower

export function generateTower(seed = Math.floor(Math.random() * 0xFFFFFFFF)) {
    const allPlatforms = [];
    const allEnemies = [];
    const allCollectibles = [];
    const rootRng = mulberry32(seed >>> 0);
    let previousZoneExit = null;

    for (const zone of ZONES) {
        const zoneSeed = Math.floor(rootRng() * 0xFFFFFFFF);
        const data = zone.generate(zoneSeed, previousZoneExit);
        allPlatforms.push(...data.platforms);
        allEnemies.push(...data.enemies);
        allCollectibles.push(...data.collectibles);
        previousZoneExit = clonePlatform(data.platforms[data.platforms.length - 1]);
    }

    // Mirror all theta values for CCW player direction (left-to-right visually).
    // Platforms spiral in decreasing theta so CCW runner encounters them naturally.
    for (const p of allPlatforms) {
        p.theta = (PI2 - p.theta) % PI2;
    }
    for (const e of allEnemies) {
        e.theta = (PI2 - e.theta) % PI2;
        if (e.orbitSpeed) e.orbitSpeed = -e.orbitSpeed;
    }
    for (const c of allCollectibles) {
        c.theta = (PI2 - c.theta) % PI2;
    }

    return { platforms: allPlatforms, enemies: allEnemies, collectibles: allCollectibles };
}
