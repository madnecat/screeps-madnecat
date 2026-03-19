// ============================================================
// MoveToTarget.js — Smart movement helper
//
// Drop-in replacement for creep.moveTo(target).
// Detects when a creep is stuck and handles two cases:
//
//   Case 1 — Near destination (range ≤ 2):
//     The tile itself is occupied (source being mined, creep
//     standing on it, etc.). Scans the 8 adjacent tiles around
//     the destination and moves to the closest free one.
//
//   Case 2 — Far from destination:
//     The creep is wedged in a corridor by another creep.
//     Moves to a random free adjacent tile to yield the path.
//
// Usage:
//   var moveToTarget = require('MoveToTarget');
//   moveToTarget.move(creep, target);              // basic
//   moveToTarget.move(creep, target, { reusePath: 5 });  // with options
// ============================================================

var moveToTarget = {

    // ----------------------------------------------------------
    // move
    //
    // Main entry point. Call this instead of creep.moveTo().
    // target  — any game object with .pos, or a RoomPosition.
    // options — same options object as creep.moveTo() (optional).
    // ----------------------------------------------------------
    move: function (creep, target, options) {
        options = options || {};

        // Check if the creep was stuck last tick (didn't move, not fatigued).
        if (this._isStuck(creep)) {
            var targetPos = target.pos || target;
            var range     = creep.pos.getRangeTo(targetPos);

            if (range <= 2) {
                // --------------------------------------------------
                // Case 1: We're right next to the destination but
                // can't reach it — it's occupied.
                // Find the closest free adjacent tile around the target.
                // --------------------------------------------------
                var freePos = this._findFreeAdjacentPos(creep, targetPos);
                if (freePos) {
                    creep.say('↔');
                    creep.memory._stuckTicks = 0;
                    this._savePos(creep);
                    // reusePath:0 forces an immediate new path to the free tile.
                    return creep.moveTo(freePos, { reusePath: 0, visualizePathStyle: { stroke: '#ff8800' } });
                }

            } else {
                // --------------------------------------------------
                // Case 2: Stuck far from destination — we're blocking
                // a corridor. Step aside to a free adjacent tile so
                // other creeps can pass.
                // --------------------------------------------------
                creep.say('↕');
                creep.memory._stuckTicks = 0;
                this._savePos(creep);
                return this._stepAside(creep);
            }
        }

        // Normal movement — save position for stuck detection next tick.
        this._savePos(creep);
        return creep.moveTo(target, options);
    },

    // ----------------------------------------------------------
    // _isStuck
    //
    // Returns true if the creep has not moved for at least
    // STUCK_THRESHOLD consecutive ticks and is not fatigued.
    // Uses _stuckTicks in memory as a counter.
    // ----------------------------------------------------------
    _isStuck: function (creep) {
        var STUCK_THRESHOLD = 3;

        if (!creep.memory._lastPos) return false;
        if (creep.fatigue > 0)      return false;

        var last = creep.memory._lastPos;

        // If move() wasn't called last tick (e.g. creep was harvesting in place),
        // the counter is stale — reset it so we don't get false positives.
        if (Game.time - last.tick > 1) {
            creep.memory._stuckTicks = 0;
            return false;
        }

        var samePos = last.x        === creep.pos.x
                   && last.y        === creep.pos.y
                   && last.roomName === creep.pos.roomName;

        if (samePos) {
            creep.memory._stuckTicks = (creep.memory._stuckTicks || 0) + 1;
        } else {
            creep.memory._stuckTicks = 0;
        }

        return creep.memory._stuckTicks >= STUCK_THRESHOLD;
    },

    // ----------------------------------------------------------
    // _savePos
    //
    // Stores the current position in memory so _isStuck can
    // compare it on the next tick.
    // ----------------------------------------------------------
    _savePos: function (creep) {
        creep.memory._lastPos = {
            x:        creep.pos.x,
            y:        creep.pos.y,
            roomName: creep.pos.roomName,
            tick:     Game.time
        };
    },

    // ----------------------------------------------------------
    // _findFreeAdjacentPos
    //
    // Scans the 8 tiles around targetPos and returns the one
    // closest to the creep that is walkable and unoccupied.
    // Returns null if every adjacent tile is blocked.
    // ----------------------------------------------------------
    _findFreeAdjacentPos: function (creep, targetPos) {
        var terrain    = creep.room.getTerrain();
        var candidates = [];

        for (var dx = -1; dx <= 1; dx++) {
            for (var dy = -1; dy <= 1; dy++) {
                if (dx === 0 && dy === 0) continue;

                var x = targetPos.x + dx;
                var y = targetPos.y + dy;

                // Stay within room bounds
                if (x < 1 || x > 48 || y < 1 || y > 48) continue;

                // Skip walls
                if (terrain.get(x, y) === TERRAIN_MASK_WALL) continue;

                var pos = new RoomPosition(x, y, creep.room.name);

                // Skip tiles already occupied by another creep
                if (pos.lookFor(LOOK_CREEPS).length > 0) continue;

                candidates.push(pos);
            }
        }

        if (candidates.length === 0) return null;

        // Return the candidate closest to the creep to minimise detour.
        candidates.sort(function (a, b) {
            return creep.pos.getRangeTo(a) - creep.pos.getRangeTo(b);
        });
        return candidates[0];
    },

    // ----------------------------------------------------------
    // _stepAside
    //
    // Moves the creep one tile in a random free direction to
    // yield the path to whoever is behind it.
    // ----------------------------------------------------------
    _stepAside: function (creep) {
        var terrain    = creep.room.getTerrain();
        var freeTiles  = [];

        for (var dx = -1; dx <= 1; dx++) {
            for (var dy = -1; dy <= 1; dy++) {
                if (dx === 0 && dy === 0) continue;

                var x = creep.pos.x + dx;
                var y = creep.pos.y + dy;

                if (x < 1 || x > 48 || y < 1 || y > 48) continue;
                if (terrain.get(x, y) === TERRAIN_MASK_WALL) continue;

                var pos = new RoomPosition(x, y, creep.room.name);
                if (pos.lookFor(LOOK_CREEPS).length > 0) continue;

                freeTiles.push(pos);
            }
        }

        if (freeTiles.length === 0) return ERR_NO_PATH;

        // Pick a random free tile so creeps don't all step to the same spot.
        var pick = freeTiles[Math.floor(Math.random() * freeTiles.length)];
        return creep.moveTo(pick, { reusePath: 0 });
    }
};

module.exports = moveToTarget;
