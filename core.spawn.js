// ============================================================
// core.spawn.js — Creep spawning and death management
//
// Responsibilities:
//   - Spawn the right number of each role (manage* functions)
//   - Clean up dead creep memory and detect explorer kills
//   - Helper utilities: getSpawn, trySpawn, bodyCost, selectBody
//
// SPAWNING PRIORITY (enforced by call order in main.js):
//   Harvesters > Upgraders > Builders > Explorers
// ============================================================

var CONFIG = require('core.config');
var G      = require('core.globals');

var coreSpawn = {

    // ----------------------------------------------------------
    // getSpawn
    // Returns the first available spawn, or null if none exist.
    // Never hardcodes a spawn name.
    // ----------------------------------------------------------
    getSpawn: function () {
        for (var name in Game.spawns) {
            return Game.spawns[name];
        }
        return null;
    },

    // ----------------------------------------------------------
    // trySpawn
    //
    // Attempts to spawn a creep. Returns true on success.
    // On ERR_NO_PATH (spawn exit blocked by creeps), forces all
    // creeps adjacent to the spawn to move away so the next
    // attempt can succeed.
    // ----------------------------------------------------------
    trySpawn: function (spawn, body, role, extraMemory) {
        var newName = role.charAt(0).toUpperCase() + role.slice(1) + Game.time;
        var memory  = Object.assign({ role: role }, extraMemory || {});
        var result  = spawn.spawnCreep(body, newName, { memory: memory });

        if (result === OK) {
            console.log('[Spawn] Spawning: ' + newName +
                ' | body: [' + body.join(', ') + ']' +
                ' | cost: ' + this.bodyCost(body));
            return true;

        } else if (result === ERR_NOT_ENOUGH_ENERGY) {
            if (Game.time % 50 === 0) {
                console.log('[Spawn] Waiting for energy to spawn ' + role +
                    ' (need ' + this.bodyCost(body) + ', have ' + spawn.store[RESOURCE_ENERGY] + ')');
            }

        } else if (result === ERR_NO_PATH) {
            // All tiles around the spawn are blocked — push nearby creeps away.
            // Only log once every 10 ticks so it doesn't spam.
            if (Game.time % 10 === 0) {
                console.log('[Spawn] Exit blocked — pushing adjacent creeps away');
            }
            this.clearSpawnExit(spawn);

        } else if (result !== ERR_BUSY) {
            // ERR_BUSY just means it's already spawning — silently ignore.
            console.log('[Spawn] Failed to spawn ' + role + ', error: ' + result);
        }

        return false;
    },

    // ----------------------------------------------------------
    // clearSpawnExit
    //
    // Finds all creeps standing within 1 tile of the spawn and
    // tells them to move to a random nearby position so the spawn
    // exit becomes clear for the next spawn attempt.
    // ----------------------------------------------------------
    clearSpawnExit: function (spawn) {
        var nearbyCreeps = spawn.room.find(FIND_MY_CREEPS, {
            filter: function (c) {
                return c.pos.getRangeTo(spawn) <= 1;
            }
        });

        // Build a set of tiles occupied by creeps near the spawn
        var occupied = {};
        for (var i = 0; i < nearbyCreeps.length; i++) {
            occupied[nearbyCreeps[i].pos.x + ',' + nearbyCreeps[i].pos.y] = true;
        }

        for (var i = 0; i < nearbyCreeps.length; i++) {
            var creep = nearbyCreeps[i];
            // Find a walkable adjacent tile that's farther from spawn
            var bestDir = null;
            var bestDist = creep.pos.getRangeTo(spawn);
            var dirs = [TOP, TOP_RIGHT, RIGHT, BOTTOM_RIGHT, BOTTOM, BOTTOM_LEFT, LEFT, TOP_LEFT];
            for (var d = 0; d < dirs.length; d++) {
                var dx = [0, 1, 1, 1, 0, -1, -1, -1][d];
                var dy = [-1, -1, 0, 1, 1, 1, 0, -1][d];
                var nx = creep.pos.x + dx;
                var ny = creep.pos.y + dy;
                if (nx < 0 || nx > 49 || ny < 0 || ny > 49) continue;
                if (occupied[nx + ',' + ny]) continue;
                // Check terrain — avoid walls
                var terrain = spawn.room.getTerrain().get(nx, ny);
                if (terrain === TERRAIN_MASK_WALL) continue;
                var dist = Math.max(Math.abs(nx - spawn.pos.x), Math.abs(ny - spawn.pos.y));
                if (dist > bestDist) {
                    bestDist = dist;
                    bestDir = dirs[d];
                }
            }
            // If no tile farther from spawn, try any walkable unoccupied tile
            if (!bestDir) {
                for (var d = 0; d < dirs.length; d++) {
                    var dx = [0, 1, 1, 1, 0, -1, -1, -1][d];
                    var dy = [-1, -1, 0, 1, 1, 1, 0, -1][d];
                    var nx = creep.pos.x + dx;
                    var ny = creep.pos.y + dy;
                    if (nx < 0 || nx > 49 || ny < 0 || ny > 49) continue;
                    if (occupied[nx + ',' + ny]) continue;
                    var terrain = spawn.room.getTerrain().get(nx, ny);
                    if (terrain === TERRAIN_MASK_WALL) continue;
                    bestDir = dirs[d];
                    break;
                }
            }
            if (bestDir) creep.move(bestDir);
        }
    },

    // ----------------------------------------------------------
    // bodyCost
    // Returns the total energy cost of a body array.
    // ----------------------------------------------------------
    bodyCost: function (body) {
        var costs = {
            [WORK]:          100,
            [CARRY]:          50,
            [MOVE]:           50,
            [ATTACK]:         80,
            [RANGED_ATTACK]: 150,
            [HEAL]:          250,
            [TOUGH]:          10,
            [CLAIM]:         600
        };
        return body.reduce(function (total, part) {
            return total + (costs[part] || 0);
        }, 0);
    },

    // ----------------------------------------------------------
    // selectBody
    //
    // Picks the most expensive body tier that fits within the
    // room's energyCapacityAvailable (spawn + all extensions).
    // The spawn waits until it accumulates that much energy.
    // ----------------------------------------------------------
    selectBody: function (tiers, room) {
        var capacity = room.energyCapacityAvailable;
        var best = tiers[0];
        for (var i = 0; i < tiers.length; i++) {
            if (this.bodyCost(tiers[i]) <= capacity) {
                best = tiers[i];
            }
        }
        return best;
    },

    // ----------------------------------------------------------
    // selectBodyAffordable
    //
    // Like selectBody but uses current energyAvailable instead of
    // energyCapacityAvailable — spawns immediately with the best
    // affordable body rather than waiting to accumulate more energy.
    // ----------------------------------------------------------
    selectBodyAffordable: function (tiers, room) {
        var available = room.energyAvailable;
        var best = tiers[0];
        for (var i = 0; i < tiers.length; i++) {
            if (this.bodyCost(tiers[i]) <= available) {
                best = tiers[i];
            }
        }
        return best;
    },

    // ----------------------------------------------------------
    // computeSpawnPlan
    //
    // Calculates how many of each role to maintain based on the
    // current room state (sources, RCL, construction sites).
    // Writes the result to Memory.spawnPlan so you can inspect it:
    //   JSON.stringify(Memory.spawnPlan)
    // ----------------------------------------------------------
    computeSpawnPlan: function () {
        var spawn = this.getSpawn();
        if (!spawn) return null;

        var room    = spawn.room;
        var rcl     = room.controller ? room.controller.level : 1;
        var sources = room.find(FIND_SOURCES).length;
        var sites   = room.find(FIND_CONSTRUCTION_SITES).length;

        // Harvesters: 2 per source by default
        var targetHarvesters = Math.max(1, sources * CONFIG.HARVESTERS_PER_SOURCE);

        // Upgraders: look up by RCL
        var targetUpgraders = CONFIG.UPGRADERS_BY_RCL[rcl] || 1;

        // Builders: look up by construction site count
        var targetBuilders = 0;
        var table = CONFIG.BUILDERS_PER_SITES;
        for (var i = 0; i < table.length; i++) {
            if (sites >= table[i].minSites) targetBuilders = table[i].count;
        }

        var plan = {
            tick: Game.time,
            targets: {
                harvesters: targetHarvesters,
                upgraders:  targetUpgraders,
                builders:   targetBuilders,
                explorers:  CONFIG.TARGET_EXPLORERS,
            },
            reasoning: {
                harvesters: sources + ' source(s) × ' + CONFIG.HARVESTERS_PER_SOURCE + ' = ' + targetHarvesters,
                upgraders:  'RCL ' + rcl + ' → ' + targetUpgraders,
                builders:   sites + ' site(s) → ' + targetBuilders,
                explorers:  'fixed at ' + CONFIG.TARGET_EXPLORERS,
            },
            room: {
                rcl:              rcl,
                sources:          sources,
                constructionSites: sites,
                energyCapacity:   room.energyCapacityAvailable,
                energyAvailable:  room.energyAvailable,
            },
        };

        Memory.spawnPlan = plan;
        return plan;
    },

    // ----------------------------------------------------------
    // manageDeaths
    //
    // Cleans up Memory.creeps entries for dead creeps.
    // For explorers, detects if they were killed (lastTTL > 100)
    // vs died of old age, and marks the room as avoided if killed.
    //
    // Called once per tick from manageHarvesters so it runs
    // before any spawning decisions are made.
    // ----------------------------------------------------------
    manageDeaths: function () {
        for (var name in Memory.creeps) {
            if (!Game.creeps[name]) {
                var mem  = Memory.creeps[name];
                var role = mem.role || 'unknown';

                if (role === 'explorer') {
                    var lastTTL  = mem.lastTTL  || 0;
                    var lastRoom = mem.lastRoom  || null;
                    var killed   = lastTTL > 100;

                    if (killed && lastRoom) {
                        if (!Memory.exploredRooms) Memory.exploredRooms = {};
                        if (!Memory.exploredRooms[lastRoom]) Memory.exploredRooms[lastRoom] = {};
                        Memory.exploredRooms[lastRoom].avoid = true;
                        console.log('[RIP] ' + name + ' (explorer) KILLED in ' + lastRoom +
                            ' (' + lastTTL + ' ticks left) — room avoided');
                    } else {
                        console.log('[RIP] ' + name + ' (explorer) died of old age in ' +
                            (lastRoom || 'unknown'));
                    }
                } else {
                    console.log('[RIP] ' + name + ' (' + role + ') has died.');
                }

                delete Memory.creeps[name];
            }
        }
    },

    // ----------------------------------------------------------
    // manageHarvesters
    //
    // runs death cleanup each tick.
    // ----------------------------------------------------------
    manageHarvesters: function () {
        this.manageDeaths();

        var plan = this.computeSpawnPlan();
        var targetHarvesters = plan ? plan.targets.harvesters : 2;

        var harvesters = G.byRole('harvester');

        var spawn = this.getSpawn();
        if (!spawn) return;

        if (harvesters.length >= targetHarvesters) return;
        
        // If no harvesters exist, spawn immediately with whatever energy is available (priority).
        // Otherwise wait for the best body tier that fits within energyCapacityAvailable.
        // Source assignment is handled by role.harvester.js based on MAIN_SOURCE_RATIO.
        var hBody = (harvesters.length === 0 || CONFIG.DISPATCH_ON_MIN_ENERGY)
            ? this.selectBodyAffordable(CONFIG.HARVESTER_TIERS, spawn.room)
            : this.selectBody(CONFIG.HARVESTER_TIERS, spawn.room);
        this.trySpawn(spawn, hBody, 'harvester');
        return;
    },

    // ----------------------------------------------------------
    // manageUpgrader
    // ----------------------------------------------------------
    manageUpgrader: function () {
        var upgraders = G.byRole('upgrader');
        var spawn = this.getSpawn();
        if (!spawn) return;

        var target = Memory.spawnPlan ? Memory.spawnPlan.targets.upgraders : 1;
        if (upgraders.length < target) {
            var uBody = CONFIG.DISPATCH_ON_MIN_ENERGY
                ? this.selectBodyAffordable(CONFIG.UPGRADER_TIERS, spawn.room)
                : this.selectBody(CONFIG.UPGRADER_TIERS, spawn.room);
            this.trySpawn(spawn, uBody, 'upgrader');
        }
    },

    // ----------------------------------------------------------
    // manageBuilders
    // ----------------------------------------------------------
    manageBuilders: function () {
        var builders = G.byRole('builder');
        var spawn = this.getSpawn();
        if (!spawn) return;

        var target = Math.max(CONFIG.MIN_BUILDERS, Memory.spawnPlan ? Memory.spawnPlan.targets.builders : 1);
        if (builders.length < target) {
            var bBody = CONFIG.DISPATCH_ON_MIN_ENERGY
                ? this.selectBodyAffordable(CONFIG.BUILDER_TIERS, spawn.room)
                : this.selectBody(CONFIG.BUILDER_TIERS, spawn.room);
            this.trySpawn(spawn, bBody, 'builder');
        }
    },

    // ----------------------------------------------------------
    // manageFuelers
    //
    // Maintains exactly 1 fueler at all times.
    // Uses the cheapest harvester body tier — it just needs
    // WORK + CARRY + MOVE to harvest and carry energy.
    // Not counted as a harvester anywhere.
    // ----------------------------------------------------------
    manageFuelers: function () {
        var fuelers = G.byRole('fueler');
        if (fuelers.length >= CONFIG.TARGET_FUELERS) return;

        var spawn = this.getSpawn();
        if (!spawn) return;

        var body = this.selectBody(CONFIG.HARVESTER_TIERS, spawn.room);
        this.trySpawn(spawn, body, 'fueler');
    },

    // ----------------------------------------------------------
    // manageExplorers
    //
    // Only spawns when economy prerequisites are met, and only
    // when we actually need a new one.
    // ----------------------------------------------------------
    manageExplorers: function () {
        var explorers = G.byRole('explorer');

        if (explorers.length >= CONFIG.TARGET_EXPLORERS) return;

        var harvesters = G.byRole('harvester');
        if (harvesters.length < CONFIG.EXPLORER_MIN_HARVESTERS) {
            if (Game.time % 50 === 0) {
                console.log('[Explorers] Waiting for harvesters (' +
                    harvesters.length + '/' + CONFIG.EXPLORER_MIN_HARVESTERS + ')');
            }
            return;
        }

        var upgraders = G.byRole('upgrader');
        if (upgraders.length < CONFIG.EXPLORER_MIN_UPGRADERS) {
            if (Game.time % 50 === 0) {
                console.log('[Explorers] Waiting for upgraders (' +
                    upgraders.length + '/' + CONFIG.EXPLORER_MIN_UPGRADERS + ')');
            }
            return;
        }

        var spawn = this.getSpawn();
        if (!spawn) return;

        this.trySpawn(spawn, CONFIG.EXPLORER_BODY, 'explorer');
    }
};

module.exports = coreSpawn;
