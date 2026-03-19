// ============================================================
// main.js — Entry point, runs every game tick
// ============================================================

var CONFIG      = require('core.config');
var G           = require('core.globals');
var coreSpawn   = require('core.spawn');
var coreRooms   = require('core.rooms');
var coreTowers  = require('core.towers');

var roleHarvester = require('role.harvester');
var roleUpgrader  = require('role.upgrader');
var roleBuilder   = require('role.builder');
var roleExplorer  = require('role.explorer');
var roleFueler    = require('role.fueler');

module.exports.loop = function () {

    // --- GLOBALS REFRESH (must be first) ---
    G.refresh();

    // --- CPU MONITORING ---
    var cpuStart = Game.cpu.getUsed();

    // --- ROOM MANAGEMENT ---
    coreRooms.manageRoomSources();
    coreRooms.manageTowers();

    // --- TOWERS ---
    coreTowers.run();

    // --- SPAWNING (priority order: harvesters first) ---
    coreSpawn.manageHarvesters();
    coreSpawn.manageFuelers();
    coreSpawn.manageUpgrader();
    coreSpawn.manageBuilders();
    coreSpawn.manageExplorers();

    // --- CONTROLLER PROGRESS SAMPLING (every 50 ticks) ---
    // Stores {tick, progress} samples into a sliding window of ~1 hour (72 samples × 50 ticks).
    // Cleared on level-up so the new level starts with a fresh trend.
    if (Game.time % 50 === 0) {
        var _spawn      = _.first(_.values(Game.spawns));
        var _controller = _spawn && _spawn.room.controller;
        if (_controller) {
            // Reset window on level-up
            if (Memory.rclSamplesLevel !== _controller.level) {
                Memory.rclSamples      = [];
                Memory.rclSamplesLevel = _controller.level;
            }
            if (!Memory.rclSamples) Memory.rclSamples = [];
            Memory.rclSamples.push({ tick: Game.time, progress: _controller.progress });
            // Keep only the last 72 samples (~1 hour)
            if (Memory.rclSamples.length > 72) Memory.rclSamples.shift();
        }
    }

    // --- CONTROLLER PROGRESS LOG (every 100 ticks) ---
    if (Game.time % 100 === 0) {
        var spawn      = _.first(_.values(Game.spawns));
        var controller = spawn && spawn.room.controller;
        if (controller) {
            var progress  = controller.progress;
            var total     = controller.progressTotal;
            var pct       = Math.floor(progress / total * 100);
            var remaining = total - progress;

            // Compute rate from sliding window (oldest → newest sample).
            // Falls back to '?' if not enough data yet.
            var rate     = 0;
            var etaTicks = null;
            var windowLabel = '';
            if (Memory.rclSamples && Memory.rclSamples.length >= 2) {
                var oldest    = Memory.rclSamples[0];
                var newest    = Memory.rclSamples[Memory.rclSamples.length - 1];
                var tickDelta = newest.tick - oldest.tick;
                var progDelta = newest.progress - oldest.progress;
                if (tickDelta > 0) {
                    rate        = Math.round(progDelta / tickDelta * 100); // per 100 ticks
                    etaTicks    = progDelta > 0 ? Math.floor(remaining / progDelta * tickDelta) : null;
                    var winMins = Math.round(tickDelta / 60);
                    windowLabel = ' (avg ' + winMins + 'm window)';
                }
            }

            // Convert ticks to human-readable time (~1 tick/sec on shard3)
            var etaStr;
            if (!etaTicks) {
                etaStr = '?';
            } else {
                var hours = Math.floor(etaTicks / 3600);
                var mins  = Math.floor((etaTicks % 3600) / 60);
                etaStr    = etaTicks + ' ticks (~'
                    + (hours > 0 ? hours + 'h ' : '')
                    + mins + 'm)';
            }

            console.log('[RCL ' + controller.level + '] ' +
                progress + ' / ' + total + ' (' + pct + '%)' +
                ' | +' + rate + ' per 100 ticks' + windowLabel +
                ' | ETA: ' + etaStr);
        }
    }

    // --- CREEP DISPATCH ---
    if (CONFIG.PAUSE_ALL_CREEPS) {
        for (var pName in Game.creeps) {
            var pc = Game.creeps[pName];
            var state = pc.memory.harvesting  ? 'harvest'
                      : pc.memory.upgrading   ? 'upgrade'
                      : pc.memory.building    ? 'build'
                      : pc.memory.role;
            pc.say('⏸ ' + state);
        }
        return;
    }

    for (var name in Game.creeps) {
        var creep = Game.creeps[name];

        var cpuBefore = CONFIG.CPU_LOGGING ? Game.cpu.getUsed() : 0;

        // --- MANUAL OVERRIDE ---
        // Set via console: Game.creeps['Name'].memory.override = {x, y, room}
        // Clear via console: delete Game.creeps['Name'].memory.override
        if (creep.memory.override) {
            var ov  = creep.memory.override;
            var pos = new RoomPosition(ov.x, ov.y, ov.room || creep.room.name);
            creep.say('📍 OVR');
            if (creep.pos.isEqualTo(pos)) {
                creep.say('✅ OVR done');
                delete creep.memory.override;
            } else {
                creep.moveTo(pos, { visualizePathStyle: { stroke: '#ff00ff' }, reusePath: 5 });
            }
            continue;
        }

        if (creep.memory.role === 'harvester') roleHarvester.run(creep);
        if (creep.memory.role === 'fueler')    roleFueler.run(creep);
        if (creep.memory.role === 'upgrader')  roleUpgrader.run(creep);
        if (creep.memory.role === 'builder')   roleBuilder.run(creep);
        if (creep.memory.role === 'explorer')  roleExplorer.run(creep);
        if (CONFIG.CPU_LOGGING) {
            var cpuCreep = Game.cpu.getUsed() - cpuBefore;
            if (cpuCreep > 1) {
                console.log('[CPU] ' + name + ' (' + creep.memory.role + ') used ' + cpuCreep.toFixed(2));
            }
        }
    }

    // --- CPU SUMMARY ---
    if (CONFIG.CPU_LOGGING) {
        var cpuTotal = Game.cpu.getUsed() - cpuStart;
        if (cpuTotal > 15) {
            console.log('[CPU] ⚠ spike: ' + cpuTotal.toFixed(2) + '/' + Game.cpu.limit + ' at tick ' + Game.time);
        } else if (Game.time % 100 === 0) {
            console.log('[CPU] tick ' + Game.time + ': ' + cpuTotal.toFixed(2) + '/' + Game.cpu.limit);
        }
    }
};
