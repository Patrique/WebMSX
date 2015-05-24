// Copyright 2015 by Paulo Augusto Peccin. See license.txt distributed with this file.

function VDP(cpu) {
    var self = this;

    function init() {
        videoSignal = new VDPVideoSignal();
        initColorCodePatternValues();
        initPlaneResources();
    }

    this.connectEngine = function(pEngine) {
        engine = pEngine;
    };

    this.powerOn = function(paused) {
        reset();
    };

    this.powerOff = function() {
        videoSignal.signalOff();
    };

    this.setVideoStandard = function(pVideoStandard) {
    };

    this.getVideoOutput = function() {
        return videoSignal;
    };

    this.frame = function() {
        // Send clock to the CPU
        for (var i = 59736; i > 0; i--)             // 59736 = CPU clocks per frame
            if (!cpu.stop) cpu.clockPulse();

        // Update video signal
        updateFrame();

        // Request interrupt
        status |= 0x80;
        if (register1 & 0x20)
            if (!cpu.stop) cpu.INT = 0;
    };

    this.input99 = function(port) {
        // Status Register Read
        var prevStatus = status;

        status &= ~0xa0;
        dataToWrite = null;
        if (!cpu.stop) cpu.INT = 1;

        return prevStatus;
    };

    this.output99 = function(port, val) {
        // Control Write
        if (dataToWrite === null) {
            // First write. Data to write to register or VRAM Address Pointer low
            dataToWrite = val;
        } else {
            // Second write
            if (val & 0x80) {
                // Register write
                var reg = val & 0x07;
                //console.log("VDP Register Write " + Util.toHex2(reg) + " := " + Util.toHex2(dataToWrite));
                if (reg === 0) {
                    register0 = dataToWrite;
                    updateMode();
                } else if (reg === 1) {
                    register1 = dataToWrite;
                    updateMode();
                } else if (reg === 2) {
                    nameTableAddress = (dataToWrite & 0x0f) * 0x400;
                    vramNameTable = vram.subarray(nameTableAddress);
               } else if (reg === 3) {
                    colorTableAddress = dataToWrite * 0x40;
                    if (mode === 1) colorTableAddress &= 0x2000;
                    vramColorTable = vram.subarray(colorTableAddress);
               } else if (reg === 4) {
                   patternTableAddress = (dataToWrite & 0x07) * 0x800;
                    if (mode === 1) patternTableAddress &= 0x2000;
                   vramPatternTable = vram.subarray(patternTableAddress);
               } else if (reg === 5) {
                   spriteAttrTableAddress = (dataToWrite & 0x7f) * 0x80;
                   vramSpriteAttrTable = vram.subarray(spriteAttrTableAddress);
                } else if (reg === 6) {
                   spritePatternTableAddress = (dataToWrite & 0x07) * 0x800;
                   vramSpritePatternTable = vram.subarray(spritePatternTableAddress);
                } else if (reg === 7) {
                   // Text Color and Backdrop Color
                   register7 = dataToWrite;
                   backdropColor = register7 & 0x0f;
               }
            } else {
                // VRAM Address Pointer high and mode (r/w)
                vramWriteMode = val & 0x40;
                vramPointer = ((val & 0x3f) << 8) | dataToWrite;
            }
            dataToWrite = null;
        }
    };

    this.input98 = function(port) {
        dataToWrite = null;
        return vram[vramPointer++];              // VRAM Read
    };

    this.output98 = function(port, val) {
        dataToWrite = null;
        vram[vramPointer++] = val;               // VRAM Write
    };


    function reset() {
        status = 0; dataToWrite = null;
        register0 = register1 = register7 = 0;
        backdropColor = 0;
    }

    function updateFrame() {
        var blanked = (register1 & 0x40) === 0;

        // Blank if needed
        if (blanked && !patternPlaneCanvas.blanked) {
            var rgb = colorRGBs[backdropColor];
            if (patternPlaneBackBuffer.fill)
                patternPlaneBackBuffer.fill(rgb);
            else
                Util.arrayFill(patternPlaneBackBuffer, rgb);
        }
        patternPlaneCanvas.blanked = blanked;

        // Update Pattern Plane
        if (!blanked) {
            if (mode === 1) updatePatternPlaneMode1();
            else if (mode === 0) updatePatternPlaneMode0();
            else if (mode === 4) updatePatternPlaneMode4();
        }

        // Update plane image and send to monitor
        patternPlaneContext.putImageData(patternPlaneImageData, 0, 0);
        videoSignal.newFrame(patternPlaneCanvas);
    }

    function updateMode() {
        mode = ((register1 & 0x18) >>> 2) | ((register0 & 0x02) >>> 1);
    }

    function updatePatternPlaneMode0() {                                    // Graphics 1 (Screen 1)
        var pos = 0;
        for (var line = 0; line < 24; line++) {
            var bufferPos = line << 11;                                     // line * 256
            for (var col = 0; col < 32; col++) {
                var name = vramNameTable[pos];
                var colorCode = vramColorTable[name >>> 3];                 // (name / 8) 1 color for each 8 patterns
                if ((colorCode & 0x0f) === 0) colorCode |= backdropColor;   // If background color is 0 (transparent), set to backdrop
                var colorCodeValuesStart = colorCode << 8;                  // (colorCode * 256) 256 patterns for each colorCode
                var patternStart = name << 3;                               // (name * 8) 8 bytes each
                var patternEnd = patternStart + 8;
                for (var patternLine = patternStart; patternLine < patternEnd; patternLine++) {
                    var pattern = vramPatternTable[patternLine];
                    var values = colorCodePatternValues[colorCodeValuesStart + pattern];
                    patternPlaneBackBuffer.set(values, bufferPos);
                    bufferPos += 256;                                       // Advance 1 line
                }
                bufferPos -= 2040;                                          // Go back to the next char starting pixel (-256 * 8 + 8)
                pos++;
            }
        }
    }

    function updatePatternPlaneMode1() {                                    // Graphics 2 (Screen 2)
        var pos = 0;
        for (var line = 0; line < 24; line++) {
            var bufferPos = line << 11;                                     // line * 256
            for (var col = 0; col < 32; col++) {
                var name = vramNameTable[pos];
                var patternStart = name << 3;                               // (name * 8) 8 bytes each
                var patternEnd = patternStart + 8;
                for (var patternLine = patternStart; patternLine < patternEnd; patternLine++) {
                    var pattern = vramPatternTable[patternLine];
                    var colorCode = vramColorTable[patternLine];
                    if ((colorCode & 0x0f) === 0) colorCode |= backdropColor;   // If background color is 0 (transparent), set to backdrop
                    var colorCodeValuesStart = colorCode << 8;              // (colorCode * 256) 256 patterns for each colorCode
                    var values = colorCodePatternValues[colorCodeValuesStart + pattern];
                    patternPlaneBackBuffer.set(values, bufferPos);
                    bufferPos += 256;                                       // Advance 1 line
                }
                bufferPos -= 2040;                                          // Go back to the next char starting pixel (-256 * 8 + 8)
                pos++;
            }
        }
    }

    function updatePatternPlaneMode4() {                                    // Text (Screen 0)
        var pos = 0;
        var colorCode = register7;                                          // Fixed text color for all screen
        var colorCodeValuesStart = colorCode << 8;                          // (colorCode * 256) 256 patterns for each colorCode
        var borderValues = colorCodePatternValues[colorCodeValuesStart];
        for (var line = 0; line < 24; line++) {
            var bufferPos = (line << 11) ;                                  // line * 256
            for (var borderLine = 0; borderLine < 8; borderLine++) {
                patternPlaneBackBuffer.set(borderValues, bufferPos);        // 8 pixels left border
                bufferPos += 256;
            }
            bufferPos -= 2040;                                              // Go back to the next char starting pixel (-256 * 8 + 6)
            for (var col = 0; col < 40; col++) {
                var name = vramNameTable[pos];
                var patternStart = name << 3;                               // (name * 8) 8 bytes each
                var patternEnd = patternStart + 8;
                for (var patternLine = patternStart; patternLine < patternEnd; patternLine++) {
                    var pattern = vramPatternTable[patternLine];
                    var values = colorCodePatternValues[colorCodeValuesStart + pattern];
                    patternPlaneBackBuffer.set(values, bufferPos);
                    bufferPos += 256;                                       // Advance 1 line
                }
                bufferPos -= 2042;                                          // Go back to the next char starting pixel (-256 * 8 + 6)
                pos++;
            }
            for (borderLine = 0; borderLine < 8; borderLine++) {
                patternPlaneBackBuffer.set(borderValues, bufferPos);        // 8 pixels right border
                bufferPos += 256;
            }
        }
    }

    function initPlaneResources() {
        patternPlaneCanvas = document.createElement('canvas');
        patternPlaneCanvas.width = 256;
        patternPlaneCanvas.height = 192;
        patternPlaneContext = patternPlaneCanvas.getContext("2d");
        patternPlaneImageData = patternPlaneContext.createImageData(256, 192);
        if (patternPlaneImageData.data.buffer)
            patternPlaneBackBuffer = new Uint32Array(patternPlaneImageData.data.buffer);
        else {
            // Needed for IE compatibility, which has no underlying buffer
            patternPlaneBackData = patternPlaneImageData.data;
        }
    }

    function initColorCodePatternValues() {
        for (var front = 0; front < 16; front++) {
            var colorFront = colorRGBs[front];
            for (var back = 0; back < 16; back++) {
                var colorBack = colorRGBs[back];
                var colorCode = (front << 4) + back;
                for (var pattern = 0; pattern < 256; pattern++) {
                    var sizePerColorCode = 256 * 8;
                    var patternPositionInsideColorCode = pattern * 8;
                    var finalPosition = colorCode * sizePerColorCode + patternPositionInsideColorCode;
                    var patternValues = colorValuesRaw.subarray(finalPosition, finalPosition + 8);
                    for (var bit = 7; bit >= 0; bit--) {
                        var pixel = (pattern >>> bit) & 1;
                        patternValues[7 - bit] = pixel ? colorFront : colorBack;
                    }
                    colorCodePatternValues[colorCode * 256 + pattern] = patternValues;
                }
            }
        }
    }


    // Registers, pointers, temporary data

    var status = 0;
    var mode = 0;

    var register0 = 0;
    var register1 = 0;
    var register7 = 0;

    var backdropColor = 0;

    var nameTableAddress = 0;
    var colorTableAddress = 0;
    var patternTableAddress = 0;
    var spriteAttrTableAddress = 0;
    var spritePatternTableAddress = 0;

    var dataToWrite = null;
    var vramPointer = 0;
    var vramWriteMode = false;


    // VRAM

    var vram = new Uint8Array(16384);
    var vramNameTable = vram;
    var vramColorTable = vram;
    var vramPatternTable = vram;
    var vramSpriteAttrTable = vram;
    var vramSpritePatternTable = vram;


    // Planes as off-screen canvases

    var patternPlaneCanvas, patternPlaneContext, patternPlaneImageData, patternPlaneBackBuffer, patternPlaneBackData;


    // Pre calculated 8-pixel RGBA values for all color and 8-bit pattern combinations  (actually ABRG)

    var colorRGBs = new Uint32Array([ 0xff000000, 0xff000000, 0xff42c821, 0xff78dc5e, 0xffed5554, 0xfffc767d, 0xff4d52d4, 0xfff5eb42, 0xff5455fc, 0xff7879ff, 0xff54c1d4, 0xff80cee6, 0xff3bb021, 0xffba5bc9, 0xffcccccc, 0xffffffff ]);
    var colorValuesRaw = new Uint32Array(16 * 16 * 256 * 8);        // 16 front colors * 16 back colors * 256 patterns * 8 pixels
    var colorCodePatternValues = new Array(256 * 256);              // 256 colorCodes * 256 patterns


    // Connections

    var videoSignal;
    var engine;


    // Savestate  -------------------------------------------

    this.saveState = function() {
        return {
            s: status, m: mode, r0: register0, r1: register1, r7: register7, bc: backdropColor,
            nt: nameTableAddress, ct: colorTableAddress, pt: patternTableAddress, sat: spriteAttrTableAddress, spt: spritePatternTableAddress,
            d: dataToWrite, vp: vramPointer, vw: vramWriteMode,
            vram: btoa(Util.uInt8ArrayToByteString(vram))
        };
    };

    this.loadState = function(s) {
        status = s.s; mode = s.m; register0 = s.r0; register1 = s.r1; register7 = s.r7; backdropColor = s.bc;
        nameTableAddress = s.nt; colorTableAddress = s.ct; patternTableAddress = s.pt; spriteAttrTableAddress = s.sat; spritePatternTableAddress = s.spt;
        dataToWrite = s.d; vramPointer = s.vp; vramWriteMode = s.vw;
        vram = new Uint8Array(Util.byteStringToUInt8Array(atob(s.vram)));
        vramNameTable = vram.subarray(nameTableAddress);
        vramColorTable = vram.subarray(colorTableAddress);
        vramPatternTable = vram.subarray(patternTableAddress);
        vramSpriteAttrTable = vram.subarray(spriteAttrTableAddress);
        vramSpritePatternTable = vram.subarray(spritePatternTableAddress);
        patternPlaneCanvas.blanked = null;
    };


    init();

}