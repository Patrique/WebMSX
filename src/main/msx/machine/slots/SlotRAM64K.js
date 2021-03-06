// Copyright 2015 by Paulo Augusto Peccin. See license.txt distributed with this file.

wmsx.SlotRAM64K = function(content) {

    function init() {
        bytes = content;
    }

    this.powerOn = function(paused) {
    };

    this.powerOff = function() {
    };

    this.write = function(address, value) {
        //console.log ("RAM write: " + address.toString(16) + ", " + value.toString(16));
        bytes[address] = value;
    };

    this.read = function(address) {
        //console.log ("RAM read: " + address.toString(16) + ", " + bytes[address].toString(16));
        return bytes[address];
    };

    this.dump = function(from, quant) {
        var res = "";
        var i;
        for(i = from; i <= from + quant; i++) {
            res = res + i.toString(16, 2) + " ";
        }
        res += "\n";
        for(i = from; i <= from + quant; i++) {
            var val = this.read(i);
            res = res + (val != undefined ? val.toString(16, 2) + " " : "? ");
        }
        return res;
    };


    var bytes;

    this.format = wmsx.SlotFormats.RAM64K;


    // Savestate  -------------------------------------------

    this.saveState = function() {
        return {
            f: this.format.name,
            b: btoa(wmsx.Util.uInt8ArrayToByteString(bytes))
        };
    };

    this.loadState = function(state) {
        bytes = wmsx.Util.byteStringToUInt8Array(atob(state.b));
    };


    if (content) init();

};

wmsx.SlotRAM64K.createNewEmpty = function() {
    return new wmsx.SlotRAM64K(wmsx.Util.arrayFill(new Array(65536), 0xff));
};

wmsx.SlotRAM64K.createFromSaveState = function(state) {
    var ram = new wmsx.SlotRAM64K();
    ram.loadState(state);
    return ram;
};