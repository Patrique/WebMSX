// Copyright 2015 by Paulo Augusto Peccin. See license.txt distributed with this file.

wmsx.ROM = function(source, content, info) {

    this.source = source;
    this.content = content;
    if (info) this.info = info;
    else this.info = wmsx.SlotCreator.produceInfo(this);


    // Savestate  -------------------------------------------

    this.saveState = function() {
        return {
            s: this.source,
            i: this.info
            // content not needed in savestates
        };
    };

};

wmsx.ROM.loadState = function(state) {
    return new wmsx.ROM(state.s, null, state.i);
};
