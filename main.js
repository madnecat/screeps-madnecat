// ============================================================
// main.js — Entry point, runs every game tick
// ============================================================

var CONFIG     = require('core.config');
var coreSpawn  = require('core.spawn');
var coreRooms  = require('core.rooms');
var coreTowers = require('core.towers');

var roleHarvester = require('role.harvester');
var roleUpgrader  = require('role.upgrader');
var roleBuilder   = require('role.builder');
var roleExplorer  = require('role.explorer');
var roleFueler    = require('role.fueler');

module.exports.loop = function () {

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

        if (creep.memory.role === 'harvester') roleHarvester.run(creep);
        if (creep.memory.role === 'fueler')    roleFueler.run(creep);
        if (creep.memory.role === 'upgrader')  roleUpgrader.run(creep);
        if (creep.memory.role === 'builder')   roleBuilder.run(creep);
        if (creep.memory.role === 'explorer')  roleExplorer.run(creep);
    }
};
