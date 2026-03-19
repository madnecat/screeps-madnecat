// ============================================================
// role.explorer.js — Room scouting role
//
// Behaviour:
//   1. When entering a room, record or refresh it in Memory.exploredRooms
//      (sources, minerals, controller owner, RCL, timestamp).
//   2. Use BFS (breadth-first search) through the known room graph
//      to find the NEAREST unexplored or stale room, then navigate
//      toward it one hop at a time.
//   3. Owned rooms are marked permanently avoided — the explorer
//      will never enter or route through them again.
//   4. Once all reachable rooms are explored, the explorer idles
//      until rooms go stale (24h), then rescans them.
//   5. A room report (sources, minerals, status) is written to
//      Memory.roomReport and logged to console whenever the
//      explorer finishes its current sweep.
//
// Body: [MOVE, MOVE, MOVE] — 150 energy, moves 1 tile/tick.
// ============================================================

// Read shared config (rescan interval, etc.) from the central config block
var CONFIG = require('core.config');

// Maximum BFS depth (rooms away from current position) to search
// for the nearest unexplored room. Limits CPU cost per tick.
var BFS_MAX_DEPTH = 20;

var roleExplorer = {

    /** @param {Creep} creep **/
    run: function (creep) {

        if (!Memory.exploredRooms) Memory.exploredRooms = {};

        var currentRoom = creep.room.name;

        // ----------------------------------------------------------
        // RECORD / REFRESH CURRENT ROOM
        // Always update on first visit or when data is stale.
        // Owned rooms get a permanent 'avoid' flag so BFS never
        // routes through them again, even after the rescan interval.
        // ----------------------------------------------------------
        var existing  = Memory.exploredRooms[currentRoom];
        var isStale   = existing && (Game.time - existing.timestamp) > CONFIG.EXPLORER_RESCAN_INTERVAL;
        var isUnknown = !existing;

        // Track last known room and TTL every tick so death detection
        // in core.management can tell if this explorer was killed vs
        // died of old age (ticksToLive reaching 0 naturally).
        creep.memory.lastRoom = currentRoom;
        creep.memory.lastTTL  = creep.ticksToLive;

        if (isUnknown || isStale) {
            var sources    = creep.room.find(FIND_SOURCES);
            var minerals   = creep.room.find(FIND_MINERALS);
            var controller = creep.room.controller;
            var owner      = controller && controller.owner       ? controller.owner.username       : null;
            var reserved   = controller && controller.reservation ? controller.reservation.username : null;

            Memory.exploredRooms[currentRoom] = {
                // Energy: number of sources + total capacity per regen cycle
                sources:        sources.length,
                energyCapacity: sources.reduce(function (sum, s) { return sum + s.energyCapacity; }, 0),
                // Minerals present in this room
                minerals:       minerals.map(m => m.mineralType),
                // Ownership
                owner:          owner,
                reserved:       reserved,
                level:          controller ? controller.level : null,
                // Hostile = owned or reserved by someone else
                hostile:        !!(owner || reserved),
                // When this record was taken and when it expires
                timestamp:      Game.time,
                expiresAt:      Game.time + CONFIG.EXPLORER_RESCAN_INTERVAL,
                // avoid is ONLY set by death detection (core.spawn.js)
                // when an explorer is killed here — never automatically.
                // Preserve the flag across rescans so it isn't cleared.
                avoid:          existing && existing.avoid ? true : false
            };

            var label = isStale ? 'REFRESHED' : 'NEW';
            var status = owner    ? '⚠ owned by ' + owner
                       : reserved ? '🔒 reserved by ' + reserved
                       :            '✓ neutral';

            console.log('[Explorer] ' + creep.name + ' ' + label + ': ' + currentRoom +
                ' | sources: '  + sources.length +
                ' | minerals: ' + (minerals.map(m => m.mineralType).join(', ') || 'none') +
                ' | ' + status);

            // Rebuild the room report in Memory every time a room is recorded
            this.updateReport();
        }

        // ----------------------------------------------------------
        // FIND NEXT HOP via BFS
        //
        // BFS expands outward from the current room through the known
        // room graph. For each room it checks neighbours via
        // Game.map.describeExits(). The first neighbour that is either
        // unexplored or stale is the target. BFS guarantees we always
        // move toward the NEAREST unknown room, not a random one.
        //
        // Returns the name of the NEIGHBOUR of currentRoom to move
        // toward next (the first hop on the path to the target).
        // Returns null if nothing reachable is found within BFS_MAX_DEPTH.
        // ----------------------------------------------------------
        // Pass this creep's personally blocked hops to BFS so it routes around
        // exits that were found to be impassable in a foreign room (where no
        // builder can help). Stored in creep memory so it resets on death.
        if (!creep.memory.blockedHops) creep.memory.blockedHops = [];

        var nextHop = this.findNextHop(currentRoom, creep.memory.blockedHops);

        // ----------------------------------------------------------
        // SAFETY: never walk into an avoided room
        // ----------------------------------------------------------
        if (nextHop) {
            var nextData = Memory.exploredRooms[nextHop];
            if (nextData && nextData.avoid) {
                nextHop = null;
            }
        }

        // ----------------------------------------------------------
        // NO TARGET — either all reachable rooms are explored, or
        // the explorer is stuck with all nearby exits blocked.
        //
        // If not at home: navigate back. Returning home clears the
        // blocked hops list so the next sweep starts fresh.
        // If already home: log the report and wait for rooms to go stale.
        // ----------------------------------------------------------
        if (!nextHop) {
            var homeSpawn = _.first(_.values(Game.spawns));
            var atHome    = homeSpawn && creep.room.name === homeSpawn.room.name;

            if (!atHome) {
                creep.say('🔙 E home');
                var homeResult = homeSpawn
                    ? creep.moveTo(homeSpawn, { visualizePathStyle: { stroke: '#ffff00' } })
                    : ERR_NO_PATH;

                // If even going home is blocked, wander randomly to break free
                if (homeResult === ERR_NO_PATH) {
                    creep.say('🔀 E escape');
                    creep.move(Math.ceil(Math.random() * 8));

                    // Track how long we've been stuck in this room
                    if (creep.memory.stuckRoom === currentRoom) {
                        creep.memory.stuckTicks = (creep.memory.stuckTicks || 0) + 1;
                    } else {
                        creep.memory.stuckRoom  = currentRoom;
                        creep.memory.stuckTicks = 1;
                    }

                    // After 50 ticks stuck here, mark room as unreachable and clear state
                    if (creep.memory.stuckTicks > 50) {
                        console.log('[Explorer] ' + creep.name +
                            ' trapped in ' + currentRoom + ' for 50+ ticks — marking noPath');
                        if (!Memory.exploredRooms[currentRoom]) Memory.exploredRooms[currentRoom] = {};
                        Memory.exploredRooms[currentRoom].noPath = true;
                        creep.memory.stuckTicks  = 0;
                        creep.memory.blockedHops = [];
                    }
                } else {
                    creep.memory.stuckTicks = 0;
                }
                return;
            }

            // Back home — clear blocked hops so next sweep is unblocked
            if (creep.memory.blockedHops && creep.memory.blockedHops.length > 0) {
                console.log('[Explorer] ' + creep.name +
                    ' back home, clearing ' + creep.memory.blockedHops.length + ' blocked route(s)');
                creep.memory.blockedHops = [];
            }
            creep.memory.stuckTicks = 0;

            creep.say('💤 E done');
            var lastReport = creep.memory.lastReportTick || 0;
            if (Game.time - lastReport > CONFIG.EXPLORER_RESCAN_INTERVAL) {
                creep.memory.lastReportTick = Game.time;
                this.logReport();
            }
            return;
        }

        // Update say bubble and log when target changes
        creep.say('🔍 E ' + nextHop);
        if (creep.memory.targetRoom !== nextHop) {
            creep.memory.targetRoom = nextHop;
            console.log('[Explorer] ' + creep.name + ' → ' + nextHop);
        }

        // ----------------------------------------------------------
        // NAVIGATE toward the next hop room
        //
        // Use cross-room moveTo (target = center of next room) instead
        // of manually finding an exit tile. This lets the Screeps
        // pathfinder handle routing around walls and structures that
        // block the direct path to the exit tile.
        // ----------------------------------------------------------
        // Clear stale empty-path cache — moveTo caches ERR_NO_PATH as "" and never retries
        if (creep.memory._move && creep.memory._move.path === '') {
            delete creep.memory._move;
        }

        var moveResult = creep.moveTo(new RoomPosition(25, 25, nextHop), {
            visualizePathStyle: { stroke: '#ffff00' },
            ignoreCreeps: true,
            reusePath: 10
        });

        if (moveResult === ERR_NO_PATH) {
            var isHomeRoom = creep.room.find(FIND_MY_SPAWNS).length > 0;

            if (isHomeRoom) {
                // Home room — look for a constructed wall blocking the exit and ask a builder
                var walls = creep.room.find(FIND_STRUCTURES, {
                    filter: function (s) { return s.structureType === STRUCTURE_WALL; }
                });
                if (walls.length > 0) {
                    var exitDir  = creep.room.findExitTo(nextHop);
                    var exitTile = exitDir > 0 ? creep.pos.findClosestByRange(exitDir) : null;
                    var blockingWall = exitTile
                        ? _.min(walls, function (w) { return w.pos.getRangeTo(exitTile); })
                        : walls[0];
                    if (!Memory.wallBreakTarget || Memory.wallBreakTarget.id !== blockingWall.id) {
                        Memory.wallBreakTarget = {
                            room: currentRoom,
                            x:    blockingWall.pos.x,
                            y:    blockingWall.pos.y,
                            id:   blockingWall.id
                        };
                        console.log('[Explorer] ' + creep.name +
                            ' blocked by wall — requesting builder assistance');
                    }
                }
            } else {
                // Foreign room — block this hop, reroute, and nudge randomly
                if (creep.memory.blockedHops.indexOf(nextHop) === -1) {
                    creep.memory.blockedHops.push(nextHop);
                    console.log('[Explorer] ' + creep.name +
                        ' cannot reach ' + nextHop + ' from ' + currentRoom +
                        ' — trying alternative route');
                }
                creep.move(Math.ceil(Math.random() * 8));
            }
        } else if (Memory.wallBreakTarget && Memory.wallBreakTarget.room === currentRoom) {
            delete Memory.wallBreakTarget;
            delete Memory.wallBreakAssigned;
        }
    },

    // ----------------------------------------------------------
    // findNextHop (internal helper)
    //
    // BFS from startRoom through the room graph to find the nearest
    // room that is unexplored or stale (needs a refresh).
    //
    // Skips rooms marked avoid:true (owned or permanently dangerous)
    // and noPath rooms (dead ends with no navigable exit).
    // ----------------------------------------------------------
    findNextHop: function (startRoom, blockedHops) {

        blockedHops = blockedHops || [];

        var queue   = [];
        var visited = {};
        visited[startRoom] = true;

        var startExits = Game.map.describeExits(startRoom);
        for (var dir in startExits) {
            var neighbour = startExits[dir];
            if (visited[neighbour]) continue;

            var nData = Memory.exploredRooms[neighbour];
            if (nData && nData.avoid)   continue; // permanently skip killed-explorer rooms
            if (nData && nData.noPath)  continue; // skip dead ends
            if (nData && nData.hostile) continue; // don't transit through known hostile rooms
            if (blockedHops.indexOf(neighbour) !== -1) continue; // skip exits blocked this lifetime

            visited[neighbour] = true;
            queue.push({ room: neighbour, firstHop: neighbour, depth: 1 });
        }

        while (queue.length > 0) {
            var current = queue.shift();

            if (current.depth > BFS_MAX_DEPTH) continue;

            var data  = Memory.exploredRooms[current.room];
            var stale = data && (Game.time - data.timestamp) > CONFIG.EXPLORER_RESCAN_INTERVAL;

            if (!data || stale) {
                return current.firstHop;
            }

            var exits = Game.map.describeExits(current.room);
            for (var d in exits) {
                var next = exits[d];
                if (visited[next]) continue;

                var nextData = Memory.exploredRooms[next];
                if (nextData && nextData.avoid)   continue;
                if (nextData && nextData.noPath)  continue;
                if (nextData && nextData.hostile) continue; // don't transit through known hostile rooms
                if (blockedHops.indexOf(next) !== -1) continue;

                visited[next] = true;
                queue.push({
                    room:     next,
                    firstHop: current.firstHop,
                    depth:    current.depth + 1
                });
            }
        }

        return null;
    },

    // ----------------------------------------------------------
    // updateReport (internal helper)
    //
    // Writes a structured summary of all explored rooms to
    // Memory.roomReport. You can inspect this any time from the
    // console: JSON.stringify(Memory.roomReport)
    // ----------------------------------------------------------
    updateReport: function () {
        var report = {};
        for (var roomName in Memory.exploredRooms) {
            var d = Memory.exploredRooms[roomName];
            report[roomName] = {
                sources:        d.sources,
                energyCapacity: d.energyCapacity || 0,
                minerals:       d.minerals       || [],
                hostile:        !!d.hostile,
                owner:          d.owner          || null,
                reserved:       d.reserved       || null,
                level:          d.level          || null,
                avoided:        !!d.avoid,
                refreshIn:      d.expiresAt ? Math.max(0, d.expiresAt - Game.time) : 0
            };
        }
        Memory.roomReport = report;
    },

    // ----------------------------------------------------------
    // logReport (internal helper)
    //
    // Logs a human-readable room report to the console.
    // Called automatically when the explorer finishes a sweep,
    // or you can trigger it manually:
    //   require('role.explorer').logReport()
    // ----------------------------------------------------------
    logReport: function () {
        var rooms  = Memory.exploredRooms;
        var names  = Object.keys(rooms);
        var neutral = 0, owned = 0, reserved = 0;

        console.log('[Explorer] ========== ROOM REPORT ==========');
        for (var i = 0; i < names.length; i++) {
            var roomName = names[i];
            var d = rooms[roomName];
            var status;
            if (d.avoid) {
                status = '⚠ AVOIDED — owned by ' + (d.owner || '?');
                owned++;
            } else if (d.hostile) {
                status = '⚔ hostile' + (d.owner ? ' (owned by ' + d.owner + ')' : ' (reserved by ' + d.reserved + ')');
                owned++;
            } else if (d.reserved) {
                status = '🔒 reserved by ' + d.reserved;
                reserved++;
            } else {
                status = '✓ neutral';
                neutral++;
            }
            var refreshIn = d.expiresAt ? Math.max(0, d.expiresAt - Game.time) : 0;
            console.log('[Explorer]  ' + roomName +
                ' | ' + d.sources + ' source(s) (' + (d.energyCapacity || 0) + ' cap)' +
                ' | minerals: ' + (d.minerals && d.minerals.length ? d.minerals.join(', ') : 'none') +
                ' | ' + status +
                ' | refresh in ' + refreshIn + ' ticks');
        }
        console.log('[Explorer] Total: ' + names.length + ' rooms' +
            ' | ' + neutral + ' neutral | ' + owned + ' hostile/avoided | ' + reserved + ' reserved');
        console.log('[Explorer] ====================================');
    }
};

module.exports = roleExplorer;
