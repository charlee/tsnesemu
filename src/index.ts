import CPU from "./cpu";

class NesEmu {

  rom: Uint8Array = null;

  loadRom(rom: Uint8Array) {
    this.rom = rom;
  }

  validateRom() {
    if (!this.rom) {
      throw new Error('Call loadRom() first');
    }
  }

  run() {
    const ops = this.rom.slice(16);
    const cpu = new CPU(ops);
    cpu.runop();
  }
}