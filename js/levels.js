// Level data for Signal Spire (Tower 1) - 3 zones for prototype
// Platform types: solid, crumbling, bouncy, moving, phasing, conveyor

const PI2 = Math.PI * 2;

function generateZone1() {
    // Foundation - basic platforms, wide and forgiving, few sentinels
    const platforms = [];
    const enemies = [];
    const collectibles = [];
    const baseY = 0;

    // Starting platform - wide and safe
    platforms.push({ type: 'solid', theta: 0, y: baseY + 0.5, width: 1.2, });
    platforms.push({ type: 'solid', theta: 0.8, y: baseY + 1.5, width: 0.8 });
    platforms.push({ type: 'solid', theta: 1.8, y: baseY + 2.5, width: 0.9 });
    platforms.push({ type: 'solid', theta: 2.8, y: baseY + 3.5, width: 0.8 });
    platforms.push({ type: 'solid', theta: 3.8, y: baseY + 4.5, width: 1.0 });
    platforms.push({ type: 'solid', theta: 4.8, y: baseY + 5.5, width: 0.8 });
    platforms.push({ type: 'solid', theta: 5.6, y: baseY + 6.5, width: 0.9 });
    platforms.push({ type: 'solid', theta: 0.3, y: baseY + 7.5, width: 0.8 });
    platforms.push({ type: 'solid', theta: 1.2, y: baseY + 8.5, width: 1.0 });
    platforms.push({ type: 'solid', theta: 2.2, y: baseY + 9.5, width: 0.9 });
    platforms.push({ type: 'solid', theta: 3.2, y: baseY + 10.5, width: 0.8 });
    platforms.push({ type: 'bouncy', theta: 4.2, y: baseY + 11.0, width: 0.7 });
    platforms.push({ type: 'solid', theta: 4.2, y: baseY + 13.5, width: 1.0 });
    platforms.push({ type: 'solid', theta: 5.2, y: baseY + 14.5, width: 0.8 });
    platforms.push({ type: 'solid', theta: 0.0, y: baseY + 15.5, width: 0.9 });
    platforms.push({ type: 'solid', theta: 1.0, y: baseY + 16.5, width: 0.8 });
    platforms.push({ type: 'solid', theta: 2.0, y: baseY + 17.5, width: 0.9 });
    platforms.push({ type: 'solid', theta: 3.0, y: baseY + 18.5, width: 1.0 });
    platforms.push({ type: 'solid', theta: 4.0, y: baseY + 19.5, width: 0.8 });

    // Sentinels - basic patrol enemies
    enemies.push({ type: 'sentinel', theta: 2.8, y: baseY + 3.5, patrolWidth: 0.6 });
    enemies.push({ type: 'sentinel', theta: 0.3, y: baseY + 7.5, patrolWidth: 0.5 });
    enemies.push({ type: 'sentinel', theta: 2.0, y: baseY + 17.5, patrolWidth: 0.7 });

    // Collectible orbs
    for (let i = 0; i < 15; i++) {
        collectibles.push({
            theta: (i * 1.3) % PI2,
            y: baseY + 1 + i * 1.3,
            value: i % 3 === 0 ? 50 : 10,
        });
    }

    return { platforms, enemies, collectibles, height: 20 };
}

function generateZone2() {
    // Interference - crumbling + moving platforms, orbiters
    const platforms = [];
    const enemies = [];
    const collectibles = [];
    const baseY = 20;

    platforms.push({ type: 'solid', theta: 0, y: baseY + 0.5, width: 1.0 });
    platforms.push({ type: 'crumbling', theta: 1.0, y: baseY + 1.5, width: 0.7 });
    platforms.push({ type: 'solid', theta: 2.2, y: baseY + 2.5, width: 0.8 });
    platforms.push({ type: 'moving', theta: 3.0, y: baseY + 3.5, width: 0.7, moveRange: 0.8, moveSpeed: 1.0 });
    platforms.push({ type: 'solid', theta: 4.2, y: baseY + 4.5, width: 0.8 });
    platforms.push({ type: 'crumbling', theta: 5.0, y: baseY + 5.5, width: 0.7 });
    platforms.push({ type: 'solid', theta: 5.8, y: baseY + 6.5, width: 0.9 });
    platforms.push({ type: 'moving', theta: 0.5, y: baseY + 7.5, width: 0.7, moveRange: 1.0, moveSpeed: 0.8 });
    platforms.push({ type: 'solid', theta: 1.5, y: baseY + 8.5, width: 0.8 });
    platforms.push({ type: 'crumbling', theta: 2.5, y: baseY + 9.5, width: 0.6 });
    platforms.push({ type: 'bouncy', theta: 3.5, y: baseY + 10.0, width: 0.7 });
    platforms.push({ type: 'solid', theta: 3.5, y: baseY + 12.5, width: 1.0 });
    platforms.push({ type: 'moving', theta: 4.5, y: baseY + 13.5, width: 0.7, moveRange: 1.2, moveSpeed: 1.2 });
    platforms.push({ type: 'crumbling', theta: 5.5, y: baseY + 14.5, width: 0.6 });
    platforms.push({ type: 'solid', theta: 0.2, y: baseY + 15.5, width: 0.8 });
    platforms.push({ type: 'solid', theta: 1.2, y: baseY + 16.5, width: 0.7 });
    platforms.push({ type: 'moving', theta: 2.2, y: baseY + 17.5, width: 0.7, moveRange: 0.9, moveSpeed: 1.1 });
    platforms.push({ type: 'crumbling', theta: 3.2, y: baseY + 18.5, width: 0.6 });
    platforms.push({ type: 'solid', theta: 4.2, y: baseY + 19.5, width: 1.0 });

    // Orbiters
    enemies.push({ type: 'orbiter', theta: 0, y: baseY + 5.0, orbitSpeed: 1.5 });
    enemies.push({ type: 'orbiter', theta: Math.PI, y: baseY + 11.0, orbitSpeed: -1.2 });
    enemies.push({ type: 'orbiter', theta: 1.0, y: baseY + 16.0, orbitSpeed: 1.8 });

    // Sentinels
    enemies.push({ type: 'sentinel', theta: 2.2, y: baseY + 2.5, patrolWidth: 0.5 });
    enemies.push({ type: 'sentinel', theta: 1.5, y: baseY + 8.5, patrolWidth: 0.6 });

    for (let i = 0; i < 12; i++) {
        collectibles.push({
            theta: (i * 1.6 + 0.5) % PI2,
            y: baseY + 1 + i * 1.6,
            value: i % 4 === 0 ? 100 : (i % 2 === 0 ? 50 : 10),
        });
    }

    return { platforms, enemies, collectibles, height: 20 };
}

function generateZone3() {
    // Storm - all platform types, zappers, increased difficulty
    const platforms = [];
    const enemies = [];
    const collectibles = [];
    const baseY = 40;

    platforms.push({ type: 'solid', theta: 0, y: baseY + 0.5, width: 0.9 });
    platforms.push({ type: 'phasing', theta: 1.0, y: baseY + 1.5, width: 0.7, phaseSpeed: 1.5 });
    platforms.push({ type: 'solid', theta: 2.0, y: baseY + 2.5, width: 0.7 });
    platforms.push({ type: 'conveyor', theta: 3.0, y: baseY + 3.5, width: 0.8, conveyorSpeed: 1.0 });
    platforms.push({ type: 'crumbling', theta: 4.0, y: baseY + 4.5, width: 0.6 });
    platforms.push({ type: 'moving', theta: 5.0, y: baseY + 5.5, width: 0.6, moveRange: 1.0, moveSpeed: 1.5 });
    platforms.push({ type: 'solid', theta: 0.0, y: baseY + 6.5, width: 0.7 });
    platforms.push({ type: 'phasing', theta: 1.0, y: baseY + 7.5, width: 0.6, phaseSpeed: 2.0 });
    platforms.push({ type: 'bouncy', theta: 2.0, y: baseY + 8.0, width: 0.6 });
    platforms.push({ type: 'solid', theta: 2.0, y: baseY + 10.5, width: 0.8 });
    platforms.push({ type: 'conveyor', theta: 3.0, y: baseY + 11.5, width: 0.7, conveyorSpeed: -1.2 });
    platforms.push({ type: 'moving', theta: 4.0, y: baseY + 12.5, width: 0.6, moveRange: 1.2, moveSpeed: 1.3 });
    platforms.push({ type: 'crumbling', theta: 5.0, y: baseY + 13.5, width: 0.6 });
    platforms.push({ type: 'solid', theta: 5.8, y: baseY + 14.5, width: 0.8 });
    platforms.push({ type: 'phasing', theta: 0.5, y: baseY + 15.5, width: 0.6, phaseSpeed: 1.8 });
    platforms.push({ type: 'solid', theta: 1.5, y: baseY + 16.5, width: 0.7 });
    platforms.push({ type: 'moving', theta: 2.5, y: baseY + 17.5, width: 0.6, moveRange: 1.0, moveSpeed: 1.5 });
    platforms.push({ type: 'crumbling', theta: 3.5, y: baseY + 18.5, width: 0.6 });
    platforms.push({ type: 'solid', theta: 4.5, y: baseY + 19.5, width: 1.2 }); // Final platform

    // Zappers
    enemies.push({ type: 'zapper', theta: 1.5, y: baseY + 4.0, arcSpan: 0.6, onTime: 1.5, offTime: 1.5 });
    enemies.push({ type: 'zapper', theta: 4.5, y: baseY + 9.5, arcSpan: 0.8, onTime: 1.0, offTime: 1.5 });
    enemies.push({ type: 'zapper', theta: 0.0, y: baseY + 14.0, arcSpan: 0.5, onTime: 1.2, offTime: 1.3 });

    // Orbiters
    enemies.push({ type: 'orbiter', theta: 0, y: baseY + 3.0, orbitSpeed: 2.0 });
    enemies.push({ type: 'orbiter', theta: Math.PI, y: baseY + 13.0, orbitSpeed: -2.2 });

    // Sentinels
    enemies.push({ type: 'sentinel', theta: 2.0, y: baseY + 2.5, patrolWidth: 0.5 });
    enemies.push({ type: 'sentinel', theta: 1.5, y: baseY + 16.5, patrolWidth: 0.6 });

    for (let i = 0; i < 15; i++) {
        collectibles.push({
            theta: (i * 1.1 + 1.0) % PI2,
            y: baseY + 0.5 + i * 1.3,
            value: i % 3 === 0 ? 100 : (i % 2 === 0 ? 50 : 10),
        });
    }

    return { platforms, enemies, collectibles, height: 20 };
}

export const ZONES = [
    { name: 'FOUNDATION', color1: '#00ffff', color2: '#0044aa', generate: generateZone1 },
    { name: 'INTERFERENCE', color1: '#ff00ff', color2: '#440088', generate: generateZone2 },
    { name: 'STORM', color1: '#ffaa00', color2: '#882200', generate: generateZone3 },
];

export const TOWER_HEIGHT = 60; // Total height of the tower

export function generateTower() {
    const allPlatforms = [];
    const allEnemies = [];
    const allCollectibles = [];

    for (const zone of ZONES) {
        const data = zone.generate();
        allPlatforms.push(...data.platforms);
        allEnemies.push(...data.enemies);
        allCollectibles.push(...data.collectibles);
    }

    return { platforms: allPlatforms, enemies: allEnemies, collectibles: allCollectibles };
}
