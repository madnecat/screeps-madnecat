// ============================================================
// core.config.js — Central configuration
//
// This is the ONLY file you need to edit to tune the bot.
// All other files import CONFIG from here.
// ============================================================
var CONFIG = {

    // --- Master switch ---
    // Set to true to freeze all creeps (no automatic movement or actions).
    // Use manual console commands to control them individually.
    PAUSE_ALL_CREEPS: false,

    // --- Builder provider switch ---
    // Set to true to allow builders to get energy from sources as much as containers.
    BUILDERS_ALLOW_GET_FROM_SOURCE: true,

    // --- Minimum energy dispatch ---
    // false (default): units wait until full before switching to work mode (efficient, fewer trips).
    // true:            units switch to work mode as soon as they carry any energy (responsive,
    //                  more trips but faster reaction — useful when short on harvesters).
    DISPATCH_ON_MIN_ENERGY: false,

    // --- Dynamic creep scaling ---
    // Targets are computed automatically each tick by computeSpawnPlan().
    // Consult the current plan with: JSON.stringify(Memory.spawnPlan)

    // Harvesters: spawned per energy source in the room
    TARGET_MINERAL_HARVESTERS: 0,   // still static — needs Extractor @ RCL 6
    HARVESTERS_PER_SOURCE:     2,   // 1 per source until containers are built at sources

    // Fraction of total harvesters assigned to the main source (closest to spawn).
    // The rest go to secondary sources. Always at least 1 on main regardless of ratio.
    // Example: 0.5 → 50/50 split | 0.25 → 1 main, 3 secondary (with 4 total harvesters)
    MAIN_SOURCE_RATIO:         0.25,

    // Upgraders: scale with RCL — push hard early, back off at max level
    UPGRADERS_BY_RCL: {
        1: 3,
        2: 4,   // push hard early — travel inefficiency means you need more
        3: 4,
        4: 3,
        5: 4,
        6: 4,
        7: 5,
        8: 1,   // RCL 8 is max — one upgrader just maintains it
    },

    // Builders: scale with number of active construction sites
    BUILDERS_PER_SITES: [
        { minSites:  0, count: 0 },
        { minSites:  1, count: 1 },
        { minSites:  5, count: 2 },
        { minSites: 15, count: 3 },
        { minSites: 25, count: 4 },
    ],

    TARGET_EXPLORERS: 1,  // always 1 scout

    // --- Creep body tiers ---
    // Each role has body configs ordered cheapest → most expensive.
    // The spawner automatically picks the most expensive tier that fits
    // within room.energyCapacityAvailable (spawn + all built extensions).
    // As you build more extensions, creeps upgrade bodies automatically.
    //
    // Part costs: WORK=100, CARRY=50, MOVE=50

    // Body tiers — each tier must satisfy: MOVE parts × 2 ≥ non-MOVE parts
    // so the creep moves every tick on plains (no fatigue stall).
    // Parts: WORK=100, CARRY=50, MOVE=50

    HARVESTER_TIERS: [
        [WORK, CARRY, MOVE],                                                        //  200 — 1M:2 ✓
        [WORK, WORK, CARRY, MOVE, MOVE],                                            //  350 — 2M:3 ✓  2× harvest
        [WORK, WORK, CARRY, CARRY, MOVE, MOVE],                                     //  400 — 2M:4 ✓  2× harvest + carry
        [WORK, WORK, WORK, CARRY, CARRY, MOVE, MOVE, MOVE],                         //  550 — 3M:5 ✓  3× harvest   (fits RCL2/550)
        [WORK, WORK, WORK, WORK, WORK, WORK, CARRY, CARRY, MOVE, MOVE, MOVE, MOVE], //  900 — 4M:8 ✓  6× harvest   (fits RCL4/1300)
    ],

    UPGRADER_TIERS: [
        [WORK, CARRY, MOVE],                                                        //  200 — 1M:2 ✓
        [WORK, WORK, CARRY, MOVE, MOVE],                                            //  350 — 2M:3 ✓  2× upgrade
        [WORK, WORK, CARRY, CARRY, MOVE, MOVE],                                     //  400 — 2M:4 ✓  2× upgrade + carry
        [WORK, WORK, WORK, CARRY, CARRY, MOVE, MOVE, MOVE],                         //  550 — 3M:5 ✓  3× upgrade   (fits RCL2/550)
        [WORK, WORK, WORK, WORK, WORK, WORK, CARRY, CARRY, MOVE, MOVE, MOVE, MOVE], //  900 — 4M:8 ✓  6× upgrade   (fits RCL4/1300)
    ],

    BUILDER_TIERS: [
        [WORK, CARRY, MOVE],                                                        //  200 — 1M:2 ✓
        [WORK, WORK, CARRY, MOVE, MOVE],                                            //  350 — 2M:3 ✓  2× build
        [WORK, WORK, CARRY, CARRY, MOVE, MOVE],                                     //  400 — 2M:4 ✓  2× build + carry
        [WORK, WORK, WORK, CARRY, CARRY, MOVE, MOVE, MOVE],                         //  550 — 3M:5 ✓  3× build     (fits RCL2/550)
        [WORK, WORK, WORK, WORK, WORK, CARRY, CARRY, CARRY, MOVE, MOVE, MOVE, MOVE], // 850 — 4M:8 ✓  5× build + carry (fits RCL4/1300)
    ],

    EXPLORER_BODY: [MOVE, MOVE, MOVE],  // 150 — pure scout, fixed body

    // --- Emergency fuel threshold ---
    // If no harvesters exist and spawn energy drops below this value,
    // builders and upgraders switch to emergency fuel mode to fill the spawn.
    // Set to the cost of the cheapest harvester body so a new one can be spawned.
    RESCUE_ENERGY_THRESHOLD: 200,

    // --- Explorer prerequisites ---
    // Explorers are only spawned once the economy is running.
    EXPLORER_MIN_HARVESTERS: 1,
    EXPLORER_MIN_UPGRADERS:  1,

    // --- Explorer rescan interval ---
    // Ticks before a room is considered stale and worth revisiting.
    // 28800 ≈ 24 hours at ~3 seconds per tick.
    // Owned rooms are NEVER rescanned — permanently avoided.
    EXPLORER_RESCAN_INTERVAL: 28800,

    // --- Extension placement ---
    // Walking-step radius from spawn to search for extension spots.
    // Increase if not enough tiles are found near your spawn.
    EXTENSION_SEARCH_RADIUS: 8,

    // --- Builder construction priority ---
    // Higher number = built first. Structures not listed get priority 0.
    BUILDER_SITE_PRIORITY: {
        [STRUCTURE_EXTENSION]: 5,
        [STRUCTURE_TOWER]:     4,
        [STRUCTURE_STORAGE]:   3,
        [STRUCTURE_CONTAINER]: 2,
        [STRUCTURE_ROAD]:      1,
    },

    // Maximum towers allowed per RCL (Screeps hard limits).
    TOWERS_PER_RCL: { 1:0, 2:0, 3:1, 4:1, 5:2, 6:2, 7:3, 8:6 },

    // Tower behaviour thresholds.
    // Only repair when tower has more than this fraction of energy (0-1).
    TOWER_MIN_ENERGY_TO_REPAIR: 0.5,
    // Only repair structures below this HP fraction (0-1).
    TOWER_REPAIR_THRESHOLD: 0.8,

    // Maximum extensions allowed per RCL (Screeps hard limits).
    EXTENSIONS_PER_RCL: {
        1: 0,
        2: 5,
        3: 10,
        4: 20,
        5: 30,
        6: 40,
        7: 50,
        8: 60
    },
};

module.exports = CONFIG;
