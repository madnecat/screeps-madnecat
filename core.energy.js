// ============================================================
// core.energy.js — Shared energy pickup utilities
//
// Used by role.harvester and role.builder to pick the best
// energy source, respecting source slot queues.
// ============================================================

var coreEnergy = {

    // ----------------------------------------------------------
    // sourceSlots
    //
    // Count the number of walkable tiles adjacent to a source.
    // This is the hard cap for how many creeps can stand next to it.
    // Result is cached in Memory.sourceSlots[sourceId] since terrain
    // never changes.
    // ----------------------------------------------------------
    sourceSlots: function (source) {
        if (!Memory.sourceSlots) Memory.sourceSlots = {};
        if (Memory.sourceSlots[source.id] !== undefined) return Memory.sourceSlots[source.id];

        var terrain = source.room.getTerrain();
        var slots   = 0;
        // Check all 8 adjacent tiles
        for (var dx = -1; dx <= 1; dx++) {
            for (var dy = -1; dy <= 1; dy++) {
                if (dx === 0 && dy === 0) continue;
                var x = source.pos.x + dx;
                var y = source.pos.y + dy;
                if (x < 0 || x > 49 || y < 0 || y > 49) continue;
                if (terrain.get(x, y) !== TERRAIN_MASK_WALL) slots++;
            }
        }
        Memory.sourceSlots[source.id] = slots;
        return slots;
    },

    // ----------------------------------------------------------
    // selectSource
    //
    // Pick the source with the fewest assigned workers (even distribution).
    // Tiebreak by distance — closest wins.
    // Respects a hard cap of available adjacent walkable tiles per source
    // so creeps never over-stack on one spot.
    // ----------------------------------------------------------
    selectSource: function (creep) {
        var sources = creep.room.find(FIND_SOURCES, { filter: function(s) { return s.energy > 0; } });
        if (sources.length === 0) sources = creep.room.find(FIND_SOURCES);
        if (sources.length === 0) return null;
        if (sources.length === 1) return sources[0];

        // Count all creeps currently assigned to each source (excluding self)
        var assignedCount = {};
        for (var name in Game.creeps) {
            var c = Game.creeps[name];
            if (c.id !== creep.id && c.memory.sourceId) {
                assignedCount[c.memory.sourceId] = (assignedCount[c.memory.sourceId] || 0) + 1;
            }
        }

        var best = null, bestCount = Infinity, bestDist = Infinity;
        for (var i = 0; i < sources.length; i++) {
            var s     = sources[i];
            var count = assignedCount[s.id] || 0;
            var slots = this.sourceSlots(s);

            // Skip sources that are already at their tile-capacity cap
            if (count >= slots) continue;

            var dist = creep.pos.getRangeTo(s.pos);
            if (count < bestCount || (count === bestCount && dist < bestDist)) {
                bestCount = count; bestDist = dist; best = s;
            }
        }

        // If every source is at capacity, fall back to the least-crowded one
        // so the creep isn't left unassigned (it will queue but at least moves)
        if (!best) {
            bestCount = Infinity; bestDist = Infinity;
            for (var i = 0; i < sources.length; i++) {
                var s     = sources[i];
                var count = assignedCount[s.id] || 0;
                var dist  = creep.pos.getRangeTo(s.pos);
                if (count < bestCount || (count === bestCount && dist < bestDist)) {
                    bestCount = count; bestDist = dist; best = s;
                }
            }
        }

        return best;
    },

    // ----------------------------------------------------------
    // pickupEnergy
    //
    // Finds the best available energy for a creep in priority order:
    //   1. Dropped energy on the ground (free, no harvesting)
    //   2. Container with energy
    //   3. Source (slot-aware via selectSource)
    //
    // Returns { type: 'dropped'|'container'|'source', target: object }
    // or null if nothing found.
    // ----------------------------------------------------------
    pickupEnergy: function (creep) {
        // 1. Dropped energy — only bother if it's a meaningful amount
        var dropped = creep.pos.findClosestByPath(FIND_DROPPED_RESOURCES, {
            filter: function (r) {
                return r.resourceType === RESOURCE_ENERGY && r.amount >= 50;
            }
        });
        if (dropped) return { type: 'dropped', target: dropped };

        // 2. Storage (central hub — large buffer, prefer over containers)
        var storage = creep.room.storage;
        if (storage && storage.store[RESOURCE_ENERGY] >= 50) {
            return { type: 'container', target: storage };
        }

        // 3. Container with energy
        var container = creep.pos.findClosestByPath(FIND_STRUCTURES, {
            filter: function (s) {
                return s.structureType === STRUCTURE_CONTAINER
                    && s.store[RESOURCE_ENERGY] >= 50;
            }
        });
        if (container) return { type: 'container', target: container };

        // 4. Source — harvesters use their pre-assigned sourceId,
        //            builders/upgraders just pick the closest one.
        var source;
        if (creep.memory.role === 'harvester') {
            var assigned = creep.memory.sourceId ? Game.getObjectById(creep.memory.sourceId) : null;
            if (!assigned || assigned.energy === 0) {
                var chosen = this.selectSource(creep);
                creep.memory.sourceId = chosen ? chosen.id : null;
            }
            source = creep.memory.sourceId ? Game.getObjectById(creep.memory.sourceId) : null;
        } else if (creep.memory.role === 'builder') {
            // Pick source closest to the highest-priority construction site
            var CONFIG = require('core.config');
            var bSites = creep.room.find(FIND_CONSTRUCTION_SITES);
            var bestSite = null;
            for (var bi = 0; bi < bSites.length; bi++) {
                if (!bestSite || (CONFIG.BUILDER_SITE_PRIORITY[bSites[bi].structureType] || 0) >
                                 (CONFIG.BUILDER_SITE_PRIORITY[bestSite.structureType] || 0)) {
                    bestSite = bSites[bi];
                }
            }
            var ref = bestSite
                ? bestSite.pos.findClosestByPath(FIND_SOURCES, { filter: function(s) { return s.energy > 0; } })
                : null;
            source = ref
                  || creep.pos.findClosestByPath(FIND_SOURCES, { filter: function(s) { return s.energy > 0; } })
                  || creep.pos.findClosestByPath(FIND_SOURCES);
        } else {
            source = creep.pos.findClosestByPath(FIND_SOURCES, { filter: function(s) { return s.energy > 0; } })
                  || creep.pos.findClosestByPath(FIND_SOURCES);
        }
        if (source) return { type: 'source', target: source };

        return null;
    }
};

module.exports = coreEnergy;
