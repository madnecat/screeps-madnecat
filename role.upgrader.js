// ============================================================
// role.upgrader.js — Controller upgrader role
//
// Two-state loop:
//   HARVESTING — withdraw from closest container, else harvest closest source
//   UPGRADING  — move to controller and upgradeController()
//
// Rescue mode: if no harvesters exist and spawn energy is critical,
// fill the spawn instead to unblock harvester spawning.
// ============================================================

var CONFIG       = require('core.config');
var G            = require('core.globals');
var moveToTarget = require('MoveToTarget');

var roleUpgrader = {

    /** @param {Creep} creep **/
    run: function (creep) {

        // ----------------------------------------------------------
        // RESCUE MODE
        // No harvesters + spawn critically low — fill spawn first.
        // ----------------------------------------------------------
        var harvesters = G.byRole('harvester');
        var spawn      = creep.room.find(FIND_MY_SPAWNS)[0];
        var spawnNeedsRescue = spawn
                            && harvesters.length === 0
                            && spawn.store[RESOURCE_ENERGY] < CONFIG.RESCUE_ENERGY_THRESHOLD;

        if (spawnNeedsRescue) {
            if (!creep.memory.rescuing) {
                creep.memory.rescuing = true;
                console.log('[Upgrader] ' + creep.name + ' entering RESCUE MODE — filling spawn');
            }
            creep.say('🆘 U SOS');

            if (creep.store[RESOURCE_ENERGY] === 0) {
                var source = creep.pos.findClosestByRange(FIND_SOURCES);
                if (source && creep.harvest(source) === ERR_NOT_IN_RANGE) {
                    moveToTarget.move(creep,source, { visualizePathStyle: { stroke: '#4488ff' }, reusePath: 5 });
                }
            } else {
                if (creep.transfer(spawn, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
                    moveToTarget.move(creep,spawn, { visualizePathStyle: { stroke: '#4488ff' }, reusePath: 5 });
                }
            }
            return;
        }

        if (creep.memory.rescuing) {
            creep.memory.rescuing = false;
            console.log('[Upgrader] ' + creep.name + ' exiting rescue mode — resuming upgrade');
        }

        // ----------------------------------------------------------
        // STATE TRANSITIONS
        // ----------------------------------------------------------
        if (creep.memory.upgrading && creep.store[RESOURCE_ENERGY] === 0) {
            creep.memory.upgrading = false;
        }
        var readyToUpgrade = CONFIG.DISPATCH_ON_MIN_ENERGY
            ? creep.store[RESOURCE_ENERGY] > 0
            : creep.store.getFreeCapacity() === 0;
        if (!creep.memory.upgrading && readyToUpgrade) {
            creep.memory.upgrading = true;
        }

        // ----------------------------------------------------------
        // STATE: UPGRADING
        // ----------------------------------------------------------
        if (creep.memory.upgrading) {
            creep.say('⚡ U Up');
            if (creep.upgradeController(creep.room.controller) === ERR_NOT_IN_RANGE) {
                moveToTarget.move(creep,creep.room.controller, {
                    visualizePathStyle: { stroke: '#4488ff' },
                    reusePath: 5
                });
            }
            return;
        }

        // ----------------------------------------------------------
        // STATE: HARVESTING
        // Priority: closest container with energy → closest source.
        // Harvesters fill the containers so upgraders don't need to
        // travel to sources themselves.
        // ----------------------------------------------------------


        // Energy pickup — exhaust every non-source option before mining directly.
        // Harvesters are responsible for sources; upgraders should never need to mine.

        // 1. Dropped energy on the ground (decays every tick — highest urgency)
        var dropped = creep.pos.findClosestByRange(FIND_DROPPED_RESOURCES, {
            filter: r => r.resourceType === RESOURCE_ENERGY && r.amount > 0
        });
        if (dropped) {
            creep.say('🔄 U Drop');
            if (creep.pickup(dropped) === ERR_NOT_IN_RANGE) {
                moveToTarget.move(creep,dropped, { visualizePathStyle: { stroke: '#4488ff' }, reusePath: 5 });
            }
            return;
        }

        // 2. Tombstones — dead creeps carrying energy
        var tombstone = creep.pos.findClosestByRange(FIND_TOMBSTONES, {
            filter: t => t.store[RESOURCE_ENERGY] > 0
        });
        if (tombstone) {
            creep.say('🔄 U Tomb');
            if (creep.withdraw(tombstone, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
                moveToTarget.move(creep,tombstone, { visualizePathStyle: { stroke: '#4488ff' }, reusePath: 5 });
            }
            return;
        }

        // 3. Ruins — decaying structures with leftover energy
        var ruin = creep.pos.findClosestByRange(FIND_RUINS, {
            filter: r => r.store[RESOURCE_ENERGY] > 0
        });
        if (ruin) {
            creep.say('🔄 U Ruin');
            if (creep.withdraw(ruin, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
                moveToTarget.move(creep,ruin, { visualizePathStyle: { stroke: '#4488ff' }, reusePath: 5 });
            }
            return;
        }

        // 4. Storage
        var storage = creep.room.storage;
        if (storage && storage.store[RESOURCE_ENERGY] > 0) {
            creep.say('🔄 U Store');
            if (creep.withdraw(storage, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
                moveToTarget.move(creep,storage, { visualizePathStyle: { stroke: '#4488ff' }, reusePath: 5 });
            }
            return;
        }

        // 5. Containers filled by harvesters
        var container = creep.pos.findClosestByRange(FIND_STRUCTURES, {
            filter: s => s.structureType === STRUCTURE_CONTAINER && s.store[RESOURCE_ENERGY] > 0
        });
        if (container) {
            creep.say('🔄 U Cont');
            if (creep.withdraw(container, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
                moveToTarget.move(creep,container, { visualizePathStyle: { stroke: '#4488ff' }, reusePath: 5 });
            }
            return;
        }

        // 6. Last resort: mine directly from source
        var source = creep.pos.findClosestByRange(FIND_SOURCES, { filter: s => s.energy > 0 })
                  || creep.pos.findClosestByRange(FIND_SOURCES);
        if (source) {
            creep.say('🔄 U Source');
            if (creep.harvest(source) === ERR_NOT_IN_RANGE) {
                moveToTarget.move(creep,source, { visualizePathStyle: { stroke: '#4488ff' }, reusePath: 5 });
            }
            return;
        }

        if (Game.time % 20 === 0) {
            console.log('[Upgrader] ' + creep.name + ' no reachable energy — waiting.');
        }
    }
};

module.exports = roleUpgrader;
