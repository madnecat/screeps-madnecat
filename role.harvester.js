// ============================================================
// role.harvester.js — Energy harvester role
//
// Mines energy sources, deposits to spawn/extensions/towers.
// If ALL local sources are depleted, searches explored rooms
// via BFS for the nearest neutral room with sources and
// travels there to harvest (remote harvesting).
// ============================================================

var CONFIG       = require('core.config');
var moveToTarget = require('MoveToTarget');

var roleHarvester = {

    /** @param {Creep} creep **/
    run: function (creep) {
        this.runEnergy(creep);
    },

    // ==========================================================
    // runEnergy
    // ==========================================================
    runEnergy: function (creep) {

        // --- State transitions ---
        var readyToDeposit = CONFIG.DISPATCH_ON_MIN_ENERGY
            ? creep.store[RESOURCE_ENERGY] > 0          // any energy → go deposit
            : creep.store.getFreeCapacity() === 0;       // wait until full
        if (creep.memory.harvesting && readyToDeposit) {
            creep.memory.harvesting = false;
        }
        if (!creep.memory.harvesting && creep.store[RESOURCE_ENERGY] === 0) {
            creep.memory.harvesting = true;
        }

// ----------------------------------------------------------
        // STATE: DEPOSITING
        // If carrying energy in a remote room, head home first.
        // Once home, go to whichever is closer: the nearest
        // spawn/extension/tower that needs energy, or the nearest
        // container with free capacity.
        // Fallback chain: storage → refuel creeps → idle.
        // ----------------------------------------------------------
        if (!creep.memory.harvesting) {
            var homeSpawn = _.first(_.values(Game.spawns));

            // Still in a remote room — walk back home before depositing
            if (homeSpawn && creep.room.name !== homeSpawn.room.name) {
                creep.say('🏠 H Back');
                moveToTarget.move(creep, homeSpawn, {
                    visualizePathStyle: { stroke: '#00ff00' },
                    reusePath: 10
                });
                return;
            }

            // Back home — clear remote assignment
            creep.memory.remoteRoom = null;

            // Identify the main source (closest to spawn by range).
            // Cached in Memory.mainSourceId so we don't recompute every tick.
            if (!Memory.mainSourceId && homeSpawn) {
                var allSources   = creep.room.find(FIND_SOURCES);
                var mainSource   = null;
                var closestRange = Infinity;
                for (var si = 0; si < allSources.length; si++) {
                    var r = homeSpawn.pos.getRangeTo(allSources[si].pos);
                    if (r < closestRange) { closestRange = r; mainSource = allSources[si]; }
                }
                if (mainSource) Memory.mainSourceId = mainSource.id;
            }

            // Count all harvesters alive.
            var harvesterCount = _.filter(Game.creeps, function(c) {
                return c.memory.role === 'harvester';
            }).length;

            // If this is the only harvester alive, always act as main regardless of sourceId —
            // the spawn needs energy and there's nobody else to feed it.
            var isMainHarvester = creep.memory.sourceId === Memory.mainSourceId
                               || harvesterCount === 1;

            // Used to restrict extension deposits to within 10 tiles of this harvester's source.
            var assignedSource = creep.memory.sourceId ? Game.getObjectById(creep.memory.sourceId) : null;

            if (isMainHarvester) {
                // --------------------------------------------------
                // MAIN SOURCE harvester: fill spawn, extensions, towers.
                // These gate spawning and defence — keep them topped up.
                // Fallback to storage when all are full.
                // Extensions limited to range 5 — far extensions are handled by secondary harvesters.
                // Spawn and towers have no range limit since they're critical infrastructure.
                // --------------------------------------------------
                var spawnTarget = creep.pos.findClosestByRange(FIND_STRUCTURES, {
                    filter: function (s) {
                        return (
                            (s.structureType === STRUCTURE_EXTENSION && (!assignedSource || assignedSource.pos.getRangeTo(s) <= 10)) ||
                             s.structureType === STRUCTURE_SPAWN     ||
                             s.structureType === STRUCTURE_TOWER
                        ) && s.store.getFreeCapacity(RESOURCE_ENERGY) > 0;
                    }
                });
                if (spawnTarget) {
                    creep.say('🏦 H Main');
                    if (creep.transfer(spawnTarget, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
                        moveToTarget.move(creep, spawnTarget, { visualizePathStyle: { stroke: '#00ff00' }, reusePath: 5 });
                    }
                    return;
                }

            } else {
                // --------------------------------------------------
                // SECONDARY SOURCE harvester: fill closest container.
                // Builders and upgraders pull from these containers.
                // Fallback to spawn/extensions if no containers exist yet.
                //
                // Exception: if the spawn is idle (not currently spawning)
                // and needs energy, redirect here first so it's always
                // ready to queue the next creep without waiting.
                // --------------------------------------------------
                // Only redirect to feed the spawn if there are no main harvesters alive —
                // if a main harvester exists, it's already handling spawn/extensions.
                var mainHarvesterCount = _.filter(Game.creeps, function(c) {
                    return c.memory.role === 'harvester'
                        && c.memory.sourceId === Memory.mainSourceId;
                }).length;

                if (homeSpawn && !homeSpawn.spawning
                        && homeSpawn.store.getFreeCapacity(RESOURCE_ENERGY) > 0
                        && mainHarvesterCount === 0) {
                    creep.say('🏦 H feed');
                    if (creep.transfer(homeSpawn, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
                        moveToTarget.move(creep, homeSpawn, { visualizePathStyle: { stroke: '#00ff00' }, reusePath: 5 });
                    }
                    return;
                }

                // If there's a nearby extension (within range 5) that needs energy,
                // fill it first — extensions gate spawning and are higher priority than containers.
                var nearbyExtension = creep.pos.findClosestByRange(FIND_STRUCTURES, {
                    filter: function (s) {
                        return s.structureType === STRUCTURE_EXTENSION
                            && s.store.getFreeCapacity(RESOURCE_ENERGY) > 0
                            && (!assignedSource || assignedSource.pos.getRangeTo(s) <= 10);
                    }
                });
                if (nearbyExtension) {
                    creep.say('🔌 H ext');
                    if (creep.transfer(nearbyExtension, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
                        moveToTarget.move(creep, nearbyExtension, { visualizePathStyle: { stroke: '#00ff00' }, reusePath: 5 });
                    }
                    return;
                }

                var container = creep.pos.findClosestByPath(FIND_STRUCTURES, {
                    filter: function (s) {
                        return s.structureType === STRUCTURE_CONTAINER
                            && s.store.getFreeCapacity(RESOURCE_ENERGY) > 0;
                    }
                });
                if (container) {
                    creep.say('📦 H sec');
                    if (creep.transfer(container, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
                        moveToTarget.move(creep, container, { visualizePathStyle: { stroke: '#00ff00' }, reusePath: 5 });
                    }
                    return;
                }

                // No container yet — fall through to spawn/extensions below
                var spawnTarget = creep.pos.findClosestByPath(FIND_STRUCTURES, {
                    filter: function (s) {
                        return (
                            (s.structureType === STRUCTURE_EXTENSION && (!assignedSource || assignedSource.pos.getRangeTo(s) <= 10)) ||
                            s.structureType === STRUCTURE_SPAWN     ||
                            s.structureType === STRUCTURE_TOWER
                        ) && s.store.getFreeCapacity(RESOURCE_ENERGY) > 0;
                    }
                });
                if (spawnTarget) {
                    creep.say('🏦 H dep');
                    if (creep.transfer(spawnTarget, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
                        moveToTarget.move(creep, spawnTarget, { visualizePathStyle: { stroke: '#00ff00' }, reusePath: 5 });
                    }
                    return;
                }
            }

            // All targets full — deposit into storage
            var storage = creep.room.storage;
            if (storage && storage.store.getFreeCapacity(RESOURCE_ENERGY) > 0) {
                creep.say('🏛 H store');
                if (creep.transfer(storage, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
                    moveToTarget.move(creep, storage, { visualizePathStyle: { stroke: '#00ff00' }, reusePath: 5 });
                }
                return;
            }

            var closestContainer = creep.pos.findClosestByPath(FIND_STRUCTURES, {
                    filter: function (s) {
                        return s.structureType === STRUCTURE_CONTAINER
                            && s.store.getFreeCapacity(RESOURCE_ENERGY) > 0;
                    }
                }
            );
            if (closestContainer) {
                creep.say('📦 H main C');
                if (creep.transfer(closestContainer, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
                    moveToTarget.move(creep, closestContainer, { visualizePathStyle: { stroke: '#00ff00' }, reusePath: 5 });
                }
                return;
            }

            creep.say('💤 H idle');
            if (Game.time % 20 === 0) {
                var hasStorage   = !!creep.room.storage;
                var storeFull    = hasStorage && creep.room.storage.store.getFreeCapacity(RESOURCE_ENERGY) === 0;
                var noContainers = creep.room.find(FIND_STRUCTURES, {
                    filter: s => s.structureType === STRUCTURE_CONTAINER && s.store.getFreeCapacity(RESOURCE_ENERGY) > 0
                }).length === 0;
                console.log('[Harvester] ' + creep.name + ' idle —'
                    + ' storage: ' + (hasStorage ? (storeFull ? 'full' : 'has space') : 'none')
                    + ' | containers with free space: ' + (noContainers ? 'none' : 'yes')
                    + ' | spawn/ext/towers full: true');
            }
            return;
        }

        // ----------------------------------------------------------
        // STATE: HARVESTING
        // If in home room and all local sources are depleted,
        // find the nearest explored room with sources and go there.
        // ----------------------------------------------------------
        var inHomeRoom = creep.room.find(FIND_MY_SPAWNS).length > 0;

        if (inHomeRoom) {
            var activeSources = creep.room.find(FIND_SOURCES, {
                filter: function (s) { return s.energy > 0; }
            });

            if (activeSources.length === 0) {
                // All local sources depleted — find a remote room
                if (!creep.memory.remoteRoom) {
                    creep.memory.remoteRoom = this.findRemoteRoom(creep.room.name);
                    if (creep.memory.remoteRoom) {
                        console.log('[Harvester] ' + creep.name +
                            ' local sources depleted → remote harvesting in ' +
                            creep.memory.remoteRoom);
                    }
                }
            } else {
                creep.memory.remoteRoom = null;
            }
        }

        // Navigate to remote room if assigned and not there yet
        if (creep.memory.remoteRoom && creep.room.name !== creep.memory.remoteRoom) {
            creep.say('🚀 ' + creep.memory.remoteRoom);
            moveToTarget.move(creep, new RoomPosition(25, 25, creep.memory.remoteRoom), {
                visualizePathStyle: { stroke: '#00ff00' },
                reusePath: 10
            });
            return;
        }

        creep.say(creep.memory.remoteRoom ? '⛏ H Remote' : '⛏ H Energy');

        // Assign source based on MAIN_SOURCE_RATIO; persist across ticks.
        // If assigned source is depleted, temporarily mine the closest available source.
        var source;
        if (inHomeRoom && !creep.memory.remoteRoom) {
            if (!creep.memory.sourceId) {
                var mainSourceId = Memory.mainSourceId;
                var allHarvesters = _.filter(Game.creeps, c => c.memory.role === 'harvester');
                var desiredOnMain = Math.max(1, Math.round(allHarvesters.length * CONFIG.MAIN_SOURCE_RATIO));
                var othersOnMain = _.filter(allHarvesters, h => h.id !== creep.id && h.memory.sourceId === mainSourceId).length;
                var roomSources = creep.room.find(FIND_SOURCES);
                if (mainSourceId && othersOnMain < desiredOnMain) {
                    creep.memory.sourceId = mainSourceId;
                } else {
                    var srcCount = {};
                    allHarvesters.forEach(function(h) {
                        if (h.id !== creep.id && h.memory.sourceId) srcCount[h.memory.sourceId] = (srcCount[h.memory.sourceId] || 0) + 1;
                    });
                    var bestSrc = null, bestCnt = Infinity;
                    for (var si = 0; si < roomSources.length; si++) {
                        if (roomSources[si].id === mainSourceId) continue;
                        var cnt = srcCount[roomSources[si].id] || 0;
                        if (cnt < bestCnt) { bestCnt = cnt; bestSrc = roomSources[si]; }
                    }
                    if (!bestSrc && roomSources.length > 0) bestSrc = roomSources[0]; // only one source
                    creep.memory.sourceId = bestSrc ? bestSrc.id : null;
                }
            }
            var assigned = creep.memory.sourceId ? Game.getObjectById(creep.memory.sourceId) : null;
            source = (assigned && assigned.energy > 0)
                ? assigned
                : creep.pos.findClosestByPath(FIND_SOURCES, { filter: s => s.energy > 0 }) || assigned;
        } else {
            creep.memory.sourceId = null;
            source = creep.pos.findClosestByPath(FIND_SOURCES, { filter: s => s.energy > 0 })
                  || creep.pos.findClosestByPath(FIND_SOURCES);
        }

        if (!source) {
            if (Game.time % 20 === 0) {
                console.log('[Harvester:energy] ' + creep.name + ' no reachable source!');
            }
            return;
        }

        if (creep.harvest(source) === ERR_NOT_IN_RANGE) {
            // reusePath:5 reduces CPU and lets creeps commit to a path rather
            // than jittering every tick; ignoreCreeps avoids getting stuck behind
            // another creep that is also converging on the source.
            moveToTarget.move(creep, source, { visualizePathStyle: { stroke: '#00ff00' }, ignoreCreeps: true, reusePath: 5 });
        }
    },

    // ----------------------------------------------------------
    // findRemoteRoom
    //
    // BFS through Memory.exploredRooms from the home room to find
    // the nearest neutral explored room that has at least one source.
    // Only rooms we've already visited are considered.
    // ----------------------------------------------------------
    findRemoteRoom: function (homeRoomName) {
        var explored = Memory.exploredRooms;
        if (!explored) return null;

        var queue   = [homeRoomName];
        var visited = {};
        visited[homeRoomName] = true;

        while (queue.length > 0) {
            var current = queue.shift();

            if (current !== homeRoomName) {
                var data = explored[current];
                if (data && data.sources > 0 && !data.avoid) {
                    return current;
                }
            }

            var exits = Game.map.describeExits(current);
            for (var dir in exits) {
                var next = exits[dir];
                if (visited[next]) continue;
                var nextData = explored[next];
                if (nextData && nextData.avoid) continue;
                visited[next] = true;
                queue.push(next);
            }
        }

        return null;
    },

};

module.exports = roleHarvester;
