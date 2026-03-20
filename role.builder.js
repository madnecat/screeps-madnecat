// ============================================================
// role.builder.js — Construction builder role
//
// Two-state loop:
//   HARVESTING — withdraw from closest container, else harvest closest source
//   BUILDING   — build the closest construction site
//
// Special modes (highest priority, checked first each tick):
//   FUEL MODE   — no harvesters + spawn critical: fill the spawn
//   WALL BREAK  — assigned builder dismantles a wall for the explorer
// ============================================================

var CONFIG       = require('core.config');
var G            = require('core.globals');
var moveToTarget = require('MoveToTarget');

var roleBuilder = {

    /** @param {Creep} creep **/
    run: function (creep) {

        // ----------------------------------------------------------
        // EMERGENCY FUEL MODE
        // If no harvesters exist and the spawn is critically low,
        // fill the spawn before doing anything else.
        // ----------------------------------------------------------
        var harvesters = G.byRole('harvester');
        var spawn      = creep.room.find(FIND_MY_SPAWNS)[0];
        var needsFuel  = spawn
                      && harvesters.length === 0
                      && spawn.store[RESOURCE_ENERGY] < CONFIG.RESCUE_ENERGY_THRESHOLD;

        if (needsFuel) {
            if (!creep.memory.rescuing) {
                creep.memory.rescuing = true;
                console.log('[Builder] ' + creep.name + ' entering FUEL MODE — filling spawn');
            }
            creep.say('🆘 B Fuel');

            if (creep.store[RESOURCE_ENERGY] === 0) {
                var source = creep.pos.findClosestByRange(FIND_SOURCES);
                if (source && creep.harvest(source) === ERR_NOT_IN_RANGE) {
                    moveToTarget.move(creep,source, { visualizePathStyle: { stroke: '#ff4444' }, reusePath: 5 });
                }
            } else {
                if (creep.transfer(spawn, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
                    moveToTarget.move(creep,spawn, { visualizePathStyle: { stroke: '#ff4444' }, reusePath: 5 });
                }
            }
            return;
        }

        if (creep.memory.rescuing) {
            creep.memory.rescuing = false;
            console.log('[Builder] ' + creep.name + ' exiting fuel mode — resuming build tasks');
        }

        // ----------------------------------------------------------
        // WALL BREAKING
        // One builder dismantles any wall blocking the explorer.
        // dismantle() extracts energy from the wall — no harvesting needed.
        // ----------------------------------------------------------
        if (Memory.wallBreakTarget) {
            var wt           = Memory.wallBreakTarget;
            var assigned     = Memory.wallBreakAssigned;
            var iAmAssigned  = (assigned === creep.name);
            var noneAssigned = !assigned || !Game.creeps[assigned];

            if (iAmAssigned || noneAssigned) {
                Memory.wallBreakAssigned = creep.name;

                if (wt.room !== creep.room.name) {
                    delete Memory.wallBreakTarget;
                    delete Memory.wallBreakAssigned;
                } else {
                    var wall = Game.getObjectById(wt.id);
                    if (!wall) {
                        var atTile = creep.room.lookForAt(LOOK_STRUCTURES, wt.x, wt.y);
                        wall = _.find(atTile, s => s.structureType === STRUCTURE_WALL) || null;
                    }

                    if (!wall) {
                        console.log('[Builder] ' + creep.name + ' finished breaking wall — resuming normal tasks');
                        delete Memory.wallBreakTarget;
                        delete Memory.wallBreakAssigned;
                        // fall through to normal logic
                    } else {
                        creep.say('🔨 B Wall');
                        if (creep.dismantle(wall) === ERR_NOT_IN_RANGE) {
                            moveToTarget.move(creep,wall, { visualizePathStyle: { stroke: '#ff4444' }, reusePath: 5 });
                        }
                        return;
                    }
                }
            }
        }

        // ----------------------------------------------------------
        // STATE TRANSITIONS
        // ----------------------------------------------------------
        if (creep.memory.building && creep.store[RESOURCE_ENERGY] === 0) {
            creep.memory.building = false;
        }
        var readyToBuild = CONFIG.DISPATCH_ON_MIN_ENERGY
            ? creep.store[RESOURCE_ENERGY] > 0
            : creep.store.getFreeCapacity() === 0;
        if (!creep.memory.building && readyToBuild) {
            creep.memory.building = true;
        }

        // ----------------------------------------------------------
        // STATE: BUILDING
        // Build the closest construction site.
        // If none exist, repair the most damaged structure instead.
        // ----------------------------------------------------------
        if (creep.memory.building) {
            var site = creep.pos.findClosestByRange(FIND_CONSTRUCTION_SITES);

            if (site) {
                creep.say('🚧 B Build');
                if (creep.build(site) === ERR_NOT_IN_RANGE) {
                    moveToTarget.move(creep,site, { visualizePathStyle: { stroke: '#ff4444' }, reusePath: 5 });
                }
                return;
            }

            // No sites — repair structures below 70% HP, worst first.
            var damaged = creep.room.find(FIND_STRUCTURES, {
                filter: s => s.hits < s.hitsMax * 0.7
            });
            if (damaged.length > 0) {
                var worst = _.min(damaged, s => s.hits / s.hitsMax);
                creep.say('🔧 B Repair');
                if (creep.repair(worst) === ERR_NOT_IN_RANGE) {
                    moveToTarget.move(creep, worst, { visualizePathStyle: { stroke: '#ff4444' }, reusePath: 5 });
                }
                return;
            }

            creep.say('💤 B Idle');
            if (Game.time % 20 === 0) {
                console.log('[Builder] ' + creep.name + ' idle — no construction sites and no structures below 50% HP');
            }
            return;
        }

        // ----------------------------------------------------------
        // STATE: HARVESTING
        // Go to the closest energy source: storage, container, or source.
        // ----------------------------------------------------------
        var candidates = [];

        var storage = creep.room.storage;
        if (storage && storage.store[RESOURCE_ENERGY] > 0) candidates.push(storage);

        var containers = creep.room.find(FIND_STRUCTURES, {
            filter: s => s.structureType === STRUCTURE_CONTAINER && s.store[RESOURCE_ENERGY] > 0
        });
        candidates = candidates.concat(containers);

        var sources = creep.room.find(FIND_SOURCES, { filter: s => s.energy > 0 });
        if (!sources.length) sources = creep.room.find(FIND_SOURCES);
        candidates = candidates.concat(sources);

        var target = creep.pos.findClosestByRange(candidates);
        if (!target) {
            if (Game.time % 20 === 0) console.log('[Builder] ' + creep.name + ' could not find any energy!');
            return;
        }

        creep.say('🔄 B Get');
        var actionResult = (target.structureType === undefined)
            ? creep.harvest(target)
            : creep.withdraw(target, RESOURCE_ENERGY);
        if (actionResult === ERR_NOT_IN_RANGE) {
            moveToTarget.move(creep, target, { visualizePathStyle: { stroke: '#ff4444' }, reusePath: 5 });
        }
    }
};

module.exports = roleBuilder;
