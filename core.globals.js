// ============================================================
// core.globals.js — Per-tick global cache
//
// Call refresh() once at the very start of the loop.
// All values are guaranteed fresh for the entire tick and
// must never be stored across ticks.
// ============================================================

var G = {

    // Creeps grouped by role — rebuilt every tick from Game.creeps.
    // Access: G.creepsByRole['harvester'], G.creepsByRole['fueler'], etc.
    // Falls back to [] for unknown roles so callers never need null-checks.
    creepsByRole: {},

    refresh: function () {
        this.creepsByRole = {};
        for (var name in Game.creeps) {
            var role = Game.creeps[name].memory.role;
            if (!this.creepsByRole[role]) this.creepsByRole[role] = [];
            this.creepsByRole[role].push(Game.creeps[name]);
        }
    },

    // Convenience helper — returns the list for a role, never null.
    byRole: function (role) {
        return this.creepsByRole[role] || [];
    },
};

module.exports = G;
