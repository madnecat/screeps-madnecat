// ============================================================
// core.rooms.js — Room scanning utilities
// ============================================================

var CONFIG = require('core.config');

var coreRooms = {

    // ----------------------------------------------------------
    // manageRoomSources
    //
    // Records source IDs into Memory.rooms so harvesters can
    // reference them. Runs every tick but only writes once per
    // room after the initial scan.
    // ----------------------------------------------------------
    manageRoomSources: function () {
        if (!Memory.rooms) Memory.rooms = {};

        for (var spawnName in Game.spawns) {
            var spawn    = Game.spawns[spawnName];
            var roomName = spawn.room.name;

            if (!Memory.rooms[roomName] || !Memory.rooms[roomName].sources) {
                var sources = spawn.room.find(FIND_SOURCES);
                Memory.rooms[roomName] = { sources: sources.map(s => s.id) };
                console.log('[Room Scan] ' + roomName + ': found ' + sources.length + ' source(s)');
            }
        }
    },

    // ----------------------------------------------------------
    // manageTowers
    //
    // Reminds you to place tower construction sites manually.
    // Logs once every 500 ticks when towers are needed.
    // ----------------------------------------------------------
    manageTowers: function () {
        if (Game.time % 500 !== 0) return;

        var spawn = this.getSpawn();
        if (!spawn) return;

        var room = spawn.room;
        var rcl  = room.controller ? room.controller.level : 1;
        var max  = CONFIG.TOWERS_PER_RCL[rcl] || 0;
        if (max === 0) return;

        var built   = room.find(FIND_STRUCTURES,         { filter: s => s.structureType === STRUCTURE_TOWER }).length;
        var planned = room.find(FIND_CONSTRUCTION_SITES, { filter: s => s.structureType === STRUCTURE_TOWER }).length;
        var needed  = max - built - planned;

        if (needed > 0) {
            console.log('[Towers] ⚠ You can place ' + needed + ' more tower(s) — RCL ' + rcl + ' allows ' + max + ' total. Place construction sites manually in the UI.');
        }
    },

    // Internal helper — same as coreSpawn.getSpawn
    getSpawn: function () {
        for (var name in Game.spawns) return Game.spawns[name];
        return null;
    }
};

module.exports = coreRooms;
