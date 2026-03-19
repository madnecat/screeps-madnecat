// ============================================================
// core.towers.js — Tower defence and repair logic
//
// Priority per tower each tick:
//   1. Attack hostile creeps (lowest HP first — finish them faster)
//   2. Heal friendly creeps that are damaged
//   3. Repair structures below TOWER_REPAIR_THRESHOLD
//      (only when tower energy > TOWER_MIN_ENERGY_TO_REPAIR)
// ============================================================

var CONFIG = require('core.config');

var coreTowers = {

    run: function () {
        for (var spawnName in Game.spawns) {
            var room = Game.spawns[spawnName].room;
            var towers = room.find(FIND_STRUCTURES, {
                filter: function (s) { return s.structureType === STRUCTURE_TOWER; }
            });

            for (var i = 0; i < towers.length; i++) {
                this.runTower(towers[i], room);
            }
        }
    },

    runTower: function (tower, room) {

        // 1. Attack — highest priority
        var hostiles = room.find(FIND_HOSTILE_CREEPS);
        if (hostiles.length > 0) {
            room.visual.text('⚔️', tower.pos.x, tower.pos.y - 1, { fontSize: 0.5 });
            // Target lowest HP first to eliminate threats faster
            var target = _.min(hostiles, function (c) { return c.hits; });
            tower.attack(target);
            return;
        }

        // 2. Heal damaged friendly creeps
        var wounded = room.find(FIND_MY_CREEPS, {
            filter: function (c) { return c.hits < c.hitsMax; }
        });
        if (wounded.length > 0) {
            room.visual.text('💚', tower.pos.x, tower.pos.y - 1, { fontSize: 0.5 });
            var mostWounded = _.min(wounded, function (c) { return c.hits / c.hitsMax; });
            tower.heal(mostWounded);
            return;
        }

        // 3. Repair — only when tower has enough energy
        var energyRatio = tower.store[RESOURCE_ENERGY] / tower.store.getCapacity(RESOURCE_ENERGY);
        if (energyRatio < CONFIG.TOWER_MIN_ENERGY_TO_REPAIR) return;

        var damaged = room.find(FIND_STRUCTURES, {
            filter: function (s) {
                return s.hits < s.hitsMax * CONFIG.TOWER_REPAIR_THRESHOLD
                    && s.structureType !== STRUCTURE_WALL   // walls have 300M HP — never auto-repair
                    && s.structureType !== STRUCTURE_RAMPART; // ramparts managed separately
            }
        });

        if (damaged.length > 0) {
            room.visual.text('🔧', tower.pos.x, tower.pos.y - 1, { fontSize: 0.5 });
            var worst = _.min(damaged, function (s) { return s.hits / s.hitsMax; });
            tower.repair(worst);
        }
    }
};

module.exports = coreTowers;
