/**
 *
 *
 * OpCode ref: https://www.masswerk.at/6502/6502_instruction_set.html
 */

type Reg8 = number;
type Reg16 = number;
type Flag = number;
type Byte = number;

type OpCodes = Uint8Array;

// prettier-ignore
enum AddrMode {
    RELATIVE,           // OPC $BB      branch target is PC + signed offset BB ***

    ACCUMULATOR,        // OPC A        operand is AC (implied single byte instruction)
    IMPLIED,            // OPC          operand implied

    IMMEDIATE,          // OPC #$BB     operand is byte BB

    INDIRECT,           // OPC ($LLHH)  operand is address; effective address is contents of word at address: C.w($HHLL)
    X_INDIRECT,         // OPC ($LL,X)  operand is zeropage address; effective address is word in (LL + X, LL + X + 1), inc. without carry: C.w($00LL + X)
    INDIRECT_Y,         // OPC ($LL),Y  operand is zeropage address; effective address is word in (LL, LL + 1) incremented by Y with carry: C.w($00LL) + Y

    ZEROPAGE,           // OPC $LL      operand is zeropage address (hi-byte is zero, address = $00LL)
    ZEROPAGE_X,         // OPC $LL,X    operand is zeropage address; effective address is address incremented by X without carry **
    ZEROPAGE_Y,         // OPC $LL,Y    operand is zeropage address; effective address is address incremented by Y without carry **

    ABSOLUTE,           // OPC $LLHH    operand is address $HHLL *
    ABSOLUTE_X,         // OPC $LLHH,X  operand is address; effective address is address incremented by X with carry **
    ABSOLUTE_Y,         // OPC $LLHH,Y  operand is address; effective address is address incremented by Y with carry **
}

type OpCodeFunc = (oper: number) => void;

type OpCodeInfo = {
  opc: Byte; // opcode
  bytes: number; // number of bytes
  cycles: number; // number of cycles
  addr: AddrMode; // addressing mode
  op: OpCodeFunc; // op func
};

type OpCodeMap = {
  [key: number]: OpCodeInfo;
};

class CPU {
  private A: Reg8 = 0; // accumulator
  private X: Reg8 = 0;
  private Y: Reg8 = 0;

  private SP: Reg8 = 0; // stack pointer
  private PC: Reg16 = 0; // program counter

  private N: Flag = 0; // Flag: Negative
  private V: Flag = 0; // Flag: Overflow
  private B: Flag = 0; // Flag: Break
  private I: Flag = 0; // Flag: Interrupt
  private Z: Flag = 0; // Flag: Zero
  private C: Flag = 0; // Flag: Carry

  private mem: Uint8Array; // memory
  private opCodeMap: OpCodeMap = {};

  constructor(private ops: OpCodes) {
    this.mem = new Uint8Array(0x10000);

    this.initOpCodeMap();
  }

  loadOpCode(pc: number) {
    return this.ops[pc];
  }

  /**
   * Run one instruction.
   * @return Cycles used by this operator.
   */
  runop() {
    const opc = this.loadOpCode(this.PC);
    const { op, addr, bytes, cycles } = this.opCodeMap[opc];

    // TODO: may need optimization
    const arg =
      bytes === 2
        ? this.loadOpCode(this.PC + 1)
        : bytes === 3
        ? this.loadOpCode(this.PC + 2) << (8 + this.loadOpCode(this.PC + 1))
        : 0;

    const [oper, cycleAdd] = this.address(addr, arg);

    this.PC += bytes;
    op(oper);

    return cycles + cycleAdd;
  }

  initOpCodeMap() {
    this.addOpCode(this.ADC, 0x69, 2, 2, AddrMode.IMMEDIATE);
    this.addOpCode(this.ADC, 0x65, 2, 3, AddrMode.ZEROPAGE);
    this.addOpCode(this.ADC, 0x75, 2, 4, AddrMode.ZEROPAGE_X);
    this.addOpCode(this.ADC, 0x6d, 3, 4, AddrMode.ABSOLUTE);
    this.addOpCode(this.ADC, 0x7d, 3, 4, AddrMode.ABSOLUTE_X);
    this.addOpCode(this.ADC, 0x79, 3, 4, AddrMode.ABSOLUTE_Y);
    this.addOpCode(this.ADC, 0x61, 2, 6, AddrMode.X_INDIRECT);
    this.addOpCode(this.ADC, 0x71, 2, 5, AddrMode.INDIRECT_Y);
  }

  addOpCode(op: OpCodeFunc, opc: Byte, addr: AddrMode, bytes: number, cycles: number) {
    this.opCodeMap[opc] = { op, opc, addr, bytes, cycles };
  }

  /**
   * Addressing.
   * Based on given address mode, fetch the operand part of the instruction with PC,
   * then access memory (if necessary).
   * @param addr Address mode.
   * @return The actual operand.
   */
  address(addrMode: AddrMode, arg: number): [number, number] {
    // Extra cycles this address mode causes
    let cycleAdd: number = 0;
    let value: number;

    switch (addrMode) {
      case AddrMode.ACCUMULATOR: {
        // Single byte instruction, no addressing required
        value = 0;
        break;
      }

      case AddrMode.IMPLIED: {
        // operand implied, no addressing required
        value = 0;
        break;
      }

      case AddrMode.ABSOLUTE: {
        // Absolute, OPC $LLHH, operand is address $HHLL
        value = this.mem[arg];
        break;
      }

      case AddrMode.ABSOLUTE_X: {
        // OPC $LLHH,X, operand is address; effective address is address incremented by X with carry
        if ((arg & 0xff00) !== ((arg + this.X) & 0xff00)) {
          cycleAdd = 1;
        }
        value = this.mem[arg + this.X];
        break;
      }

      case AddrMode.ABSOLUTE_Y: {
        // OPC $LLHH,Y, operand is address; effective address is address incremented by Y with carry **
        if ((arg & 0xff00) !== ((arg + this.Y) & 0xff00)) {
          cycleAdd = 1;
        }
        value = this.mem[arg + this.Y];
        break;
      }

      case AddrMode.IMMEDIATE: {
        // OPC #$BB, operand is byte BB
        value = arg;
        break;
      }

      case AddrMode.INDIRECT: {
        // OPC ($LLHH), operand is address; effective address is contents of word at address: C.w($HHLL)
        let ll = this.mem[arg];
        let hh = this.mem[(arg + 1) & 0xff];
        value = this.mem[hh << 8 + ll];
        break;
      }

      case AddrMode.X_INDIRECT: {
        // OPC ($LL,X), val = PEEK(PEEK((arg + X) % 256) + PEEK((arg + X + 1) % 256) * 256)
        arg = arg & 0xff;
        let ll = this.mem[(arg + this.X) & 0xff];
        let hh = this.mem[(arg + this.X + 1) & 0xff];
        value = this.mem[hh << 8 + ll];
        break;
      }

      case AddrMode.INDIRECT_Y: {
        // OPC $LL,Y, val = PEEK(PEEK(arg) + PEEK((arg + 1) % 256) * 256 + Y)
        arg = arg & 0xff;
        let ll = this.mem[arg];
        let hh = this.mem[(arg + 1) & 0xff];
        let addr = hh << 8 + ll;

        if ((addr & 0xff00) !== ((addr + this.Y) & 0xff00)) {
          cycleAdd = 1;
        }

        value = this.mem[addr + this.Y];
        break;
      }

      case AddrMode.ZEROPAGE: {
        value = this.mem[arg & 0xff];
        break;
      }

      case AddrMode.ZEROPAGE_X: {
        value = this.mem[(arg + this.X) & 0xff];
        break;
      }

      case AddrMode.ZEROPAGE_Y: {
        value = this.mem[(arg + this.Y) & 0xff];
        break;
      }
    }

    return [value, cycleAdd];
  }

  // OP Codes ------------------------------
  ADC: OpCodeFunc = (oper: number) => {};
}

export default CPU;
