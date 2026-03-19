// ============================================================
// role.fueler.js — Tower fueler role
//
// Solely responsible for keeping towers topped up with energy.
// Harvests from the closest available source, deposits only
// into towers. Never counted as a regular harvester.
// ============================================================

var moveToTarget = require('MoveToTarget');

var roleFueler = {

    /** @param {Creep} creep **/
    run: function (creep) {

        // State transitions
        if (creep.memory.harvesting && creep.store.getFreeCapacity() === 0) {
            creep.memory.harvesting = false;
        }
        if (!creep.memory.harvesting && creep.store[RESOURCE_ENERGY] === 0) {
            creep.memory.harvesting = true;
        }

        if (!creep.memory.harvesting) {
            var tower = creep.pos.findClosestByRange(FIND_STRUCTURES, {
                filter: function (s) {
                    return s.structureType === STRUCTURE_TOWER
                        && s.store.getFreeCapacity(RESOURCE_ENERGY) > 0;
                }
            });

            if (tower) {
                creep.say('⚡ F fuel');
                if (creep.transfer(tower, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
                    moveToTarget.move(creep, tower, { visualizePathStyle: { stroke: '#ff6600' }, reusePath: 5 });
                }
                return;
            }

            // All towers full — idle
            creep.say('💤 F full');
            return;
        }

        // Pick the closest energy provider: storage, container, or source
        var storage = creep.room.storage;
        var storageTarget = (storage && storage.store[RESOURCE_ENERGY] > 0) ? storage : null;

        var container = creep.pos.findClosestByRange(FIND_STRUCTURES, {
            filter: function (s) {
                return s.structureType === STRUCTURE_CONTAINER && s.store[RESOURCE_ENERGY] > 0;
            }
        });

        var source = creep.pos.findClosestByRange(FIND_SOURCES, {
            filter: function (s) { return s.energy > 0; }
        }) || creep.pos.findClosestByRange(FIND_SOURCES);

        // Rank by path distance and pick the nearest
        var candidates = [];
        if (storageTarget) candidates.push(storageTarget);
        if (container)     candidates.push(container);
        if (source)        candidates.push(source);

        var target = creep.pos.findClosestByRange(candidates);

        if (!target) {
            creep.say('❌ F no src');
            return;
        }

        creep.say('⛏ F fuel');
        if (target instanceof Source) {
            if (creep.harvest(target) === ERR_NOT_IN_RANGE) {
                moveToTarget.move(creep, target, { visualizePathStyle: { stroke: '#ff6600' }, ignoreCreeps: true, reusePath: 5 });
            }
        } else {
            if (creep.withdraw(target, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
                moveToTarget.move(creep, target, { visualizePathStyle: { stroke: '#ff6600' }, reusePath: 5 });
            }
        }
    },
};

module.exports = roleFueler;
