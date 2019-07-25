/**
 *
 *
 * OpCode ref: https://www.masswerk.at/6502/6502_instruction_set.html
 */

type Reg8 = number;
type Reg16 = number;
type Flag = 0 | 1;
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

type OpCodeFunc = (oper: number) => number;

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
  private A: Reg8 = 0x01ff; // accumulator
  private X: Reg8 = 0;
  private Y: Reg8 = 0;

  private SP: Reg8 = 0; // stack pointer
  private PC: Reg16 = 0; // program counter

  private N: Flag = 0; // Flag: Negative
  private V: Flag = 0; // Flag: Overflow
  private B5: Flag = 0; // Flag: Break bit 5
  private B4: Flag = 0; // Flag: Break bit 4
  private D: Flag = 0;  // Flag: Decimal (not used)
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

    const [oper, cycleAdd1] = this.address(addr, arg);

    this.PC += bytes;
    const cycleAdd2 = op(oper) || 0;

    return cycles + cycleAdd1 + cycleAdd2;
  }

  initOpCodeMap() {
    // ADC: Add Memory to Accumulator with Carry
    this.addOpCode(this.ADC, 0x69, 2, 2, AddrMode.IMMEDIATE);
    this.addOpCode(this.ADC, 0x65, 2, 3, AddrMode.ZEROPAGE);
    this.addOpCode(this.ADC, 0x75, 2, 4, AddrMode.ZEROPAGE_X);
    this.addOpCode(this.ADC, 0x6d, 3, 4, AddrMode.ABSOLUTE);
    this.addOpCode(this.ADC, 0x7d, 3, 4, AddrMode.ABSOLUTE_X);
    this.addOpCode(this.ADC, 0x79, 3, 4, AddrMode.ABSOLUTE_Y);
    this.addOpCode(this.ADC, 0x61, 2, 6, AddrMode.X_INDIRECT);
    this.addOpCode(this.ADC, 0x71, 2, 5, AddrMode.INDIRECT_Y);

    // AND: AND Memory with Accumulator
    this.addOpCode(this.AND, 0x29, 2, 2, AddrMode.IMMEDIATE);
    this.addOpCode(this.AND, 0x25, 2, 3, AddrMode.ZEROPAGE);
    this.addOpCode(this.AND, 0x35, 2, 4, AddrMode.ZEROPAGE_X);
    this.addOpCode(this.AND, 0x2d, 3, 4, AddrMode.ABSOLUTE);
    this.addOpCode(this.AND, 0x3d, 3, 4, AddrMode.ABSOLUTE_X);
    this.addOpCode(this.AND, 0x39, 3, 4, AddrMode.ABSOLUTE_Y);
    this.addOpCode(this.AND, 0x21, 2, 6, AddrMode.X_INDIRECT);
    this.addOpCode(this.AND, 0x31, 2, 5, AddrMode.INDIRECT_Y);

    // ASL: Shift Left One Bit (Memory or Accumulator)
    this.addOpCode(this.ASL, 0x0a, 1, 2, AddrMode.ACCUMULATOR);
    this.addOpCode(this.ASL, 0x06, 2, 5, AddrMode.ZEROPAGE);
    this.addOpCode(this.ASL, 0x16, 2, 6, AddrMode.ZEROPAGE_X);
    this.addOpCode(this.ASL, 0x0e, 3, 6, AddrMode.ABSOLUTE);
    this.addOpCode(this.ASL, 0x1e, 3, 7, AddrMode.ABSOLUTE_X);

    // BCC: Branch on Carry Clear
    this.addOpCode(this.BCC, 0x90, 2, 2, AddrMode.RELATIVE);

    // BCS: Branch on Carry Set
    this.addOpCode(this.BCS, 0xb0, 2, 2, AddrMode.RELATIVE);

    // BEQ: Branch on Result Zero
    this.addOpCode(this.BEQ, 0xf0, 2, 2, AddrMode.RELATIVE);

    // BIT: Test Bits in Memory with Accumulator
    this.addOpCode(this.BIT, 0x24, 2, 3, AddrMode.ZEROPAGE);
    this.addOpCode(this.BIT, 0x2c, 3, 4, AddrMode.ABSOLUTE);

    // BMI: Branch on Result Minus
    this.addOpCode(this.BMI, 0x30, 2, 2, AddrMode.RELATIVE);

    // BNE: Branch on Result not Zero
    this.addOpCode(this.BNE, 0xd0, 2, 2, AddrMode.RELATIVE);

    // BPL: Branch on Result Plus
    this.addOpCode(this.BPL, 0x10, 2, 2, AddrMode.RELATIVE);

    // BRK: Force Break
    this.addOpCode(this.BRK, 0x00, 1, 7, AddrMode.IMPLIED);

    // BVC: Branch on Overflow Clear
    this.addOpCode(this.BVC, 0x50, 2, 2, AddrMode.RELATIVE);

    // BVS: Branch on OVerflow Set
    this.addOpCode(this.BVS, 0x70, 2, 2, AddrMode.RELATIVE);

    // CLC: Clear Carry Flag
    this.addOpCode(this.CLC, 0x18, 1, 2, AddrMode.IMPLIED);

    // CLD: Clear Decimal Mode
    this.addOpCode(this.CLD, 0xd8, 1, 2, AddrMode.IMPLIED);

    // CLI: Clear Interrupt Disable Bit
    this.addOpCode(this.CLI, 0x58, 1, 2, AddrMode.IMPLIED);

    // CLV: Clear Overflow Flag
    this.addOpCode(this.CLV, 0xb8, 1, 2, AddrMode.IMPLIED);

    // CMP: Compare Memory with Accumulator
    this.addOpCode(this.CMP, 0xc9, 2, 2, AddrMode.IMMEDIATE);
    this.addOpCode(this.CMP, 0xc5, 2, 3, AddrMode.ZEROPAGE);
    this.addOpCode(this.CMP, 0xd5, 2, 4, AddrMode.ZEROPAGE_X);
    this.addOpCode(this.CMP, 0xcd, 3, 4, AddrMode.ABSOLUTE);
    this.addOpCode(this.CMP, 0xdd, 3, 4, AddrMode.ABSOLUTE_X);
    this.addOpCode(this.CMP, 0xd9, 3, 4, AddrMode.ABSOLUTE_Y);
    this.addOpCode(this.CMP, 0xc1, 2, 6, AddrMode.X_INDIRECT);
    this.addOpCode(this.CMP, 0xd1, 2, 5, AddrMode.INDIRECT_Y);

    // CPX: Compare Memory and Index X
    this.addOpCode(this.CPX, 0xe0, 2, 2, AddrMode.IMMEDIATE);
    this.addOpCode(this.CPX, 0xe4, 2, 3, AddrMode.ZEROPAGE);
    this.addOpCode(this.CPX, 0xec, 3, 4, AddrMode.ABSOLUTE);

    // CPY: Compare Memory and Index Y
    this.addOpCode(this.CPY, 0xc0, 2, 2, AddrMode.IMMEDIATE);
    this.addOpCode(this.CPY, 0xc4, 2, 3, AddrMode.ZEROPAGE);
    this.addOpCode(this.CPY, 0xcc, 3, 4, AddrMode.ABSOLUTE);
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
    let value: number = 0;

    switch (addrMode) {
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
        value = this.mem[hh << (8 + ll)];
        break;
      }

      case AddrMode.X_INDIRECT: {
        // OPC ($LL,X), val = PEEK(PEEK((arg + X) % 256) + PEEK((arg + X + 1) % 256) * 256)
        arg = arg & 0xff;
        let ll = this.mem[(arg + this.X) & 0xff];
        let hh = this.mem[(arg + this.X + 1) & 0xff];
        value = this.mem[hh << (8 + ll)];
        break;
      }

      case AddrMode.INDIRECT_Y: {
        // OPC $LL,Y, val = PEEK(PEEK(arg) + PEEK((arg + 1) % 256) * 256 + Y)
        arg = arg & 0xff;
        let ll = this.mem[arg];
        let hh = this.mem[(arg + 1) & 0xff];
        let addr = hh << (8 + ll);

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

  /**
   * Add Memory to Accumulator with Carry
   */
  ADC: OpCodeFunc = oper => {
    let result = this.A + oper + this.C;
    this.C = result > 0xff ? 1 : 0;
    result = result & 0xff;

    // Compute overflow flag
    // cite: http://www.righto.com/2012/12/the-6502-overflow-flag-explained.html
    this.V = ((result ^ oper) & (this.A ^ oper) & 0x80) > 0 ? 1 : 0;
    this.N = (result & 0x80) > 0 ? 1 : 0;
    this.Z = result === 0 ? 1 : 0;

    this.A = result;

    return 0;
  };

  /**
   * AND Memory with Accumulator
   */
  AND: OpCodeFunc = oper => {
    let result = this.A & oper;
    this.N = (result & 0x80) > 0 ? 1 : 0;
    this.Z = result === 0 ? 1 : 0;

    this.A = result;

    return 0;
  };

  /**
   * Shift Left One Bit (Memory or Accumulator)
   */
  ASL: OpCodeFunc = oper => {
    let result = this.A << 1;
    this.C = result > 0xff ? 1 : 0;
    result = result & 0xff;
    this.N = (result & 0x80) > 0 ? 1 : 0;
    this.Z = result === 0 ? 1 : 0;

    this.A = result;

    return 0;
  };

  /**
   * Branch.
   * This common function will mutate PC with oper and return corresponding cycles.
   * @param oper Operand.
   * @return Cycles cost.
   */
  branch = (oper: number): number => {
    const result = oper > 0x7f ? this.PC + oper : this.PC - 256 + oper;
    const cycles = (result & 0xff00) === (this.PC & 0xff00) ? 1 : 2;

    this.PC = result;
    return cycles;
  };

  /**
   * Branch on Carry Clear
   */
  BCC: OpCodeFunc = oper => {
    if (this.C === 0) {
      return this.branch(oper);
    }

    return 0;
  };

  /**
   * Branch on Carry Set
   */
  BCS: OpCodeFunc = oper => {
    if (this.C !== 0) {
      return this.branch(oper);
    }

    return 0;
  };

  /**
   * Branch on Result Zero
   */
  BEQ: OpCodeFunc = oper => {
    if (this.Z !== 0) {
      return this.branch(oper);
    }

    return 0;
  };

  /**
   * Test Bits in Memory with Accumulator
   * A AND M, M7 -> N, M6 -> V
   */
  BIT: OpCodeFunc = oper => {
    const result = this.A & oper;
    this.Z = result === 0 ? 1 : 0;
    this.N = (result & 0x80) === 1 ? 1 : 0;
    this.V = (result & 0x40) === 1 ? 1 : 0;

    return 0;
  };

  /**
   * Branch on Result Minus
   */
  BMI: OpCodeFunc = oper => {
    if (this.N !== 0) {
      return this.branch(oper);
    }

    return 0;
  };

  /**
   * Branch on Result not Zero
   */
  BNE: OpCodeFunc = oper => {
    if (this.Z !== 0) {
      return this.branch(oper);
    }

    return 0;
  };

  /**
   * Branch on Result Plus
   */
  BPL: OpCodeFunc = oper => {
    if (this.N === 0) {
      return this.branch(oper);
    }

    return 0;
  };

  push = (value: number) => {
    this.mem[this.SP] = value;
    this.SP--;
    this.SP = (this.SP & 0xff) | 0x0100;
  }

  packSR = (): Byte => {
    return (
      this.C |
      this.Z << 1 |
      this.I << 2 |
      this.D << 3 |
      this.B4 << 4 | 
      this.B5 << 5 |
      this.V << 6 |
      this.N << 7
    );
  }

  /**
   * Force Break
   */
  BRK: OpCodeFunc = oper => {
    this.push(this.PC + 2);
    this.push(this.packSR());
    this.I = 1;

    return 0;
  }

  /**
   * Branch on Overflow Clear
   */
  BVC: OpCodeFunc = oper => {
    if (this.V === 0) {
      return this.branch(oper);
    }

    return 0;
  }

  /**
   * Branch on Overflow Set
   */
  BVS: OpCodeFunc = oper => {
    if (this.V === 1) {
      return this.branch(oper);
    }

    return 0;
  }

  /**
   * Clear Carry Flag
   */
  CLC: OpCodeFunc = oper => {
    this.C = 0;
    return 0;
  }

  /**
   * Clear Decimal Mode
   */
  CLD: OpCodeFunc = oper => {
    this.D = 0;
    return 0;
  }

  /**
   * Clear Interrupt Disable Bit
   */
  CLI: OpCodeFunc = oper => {
    this.I = 0;
    return 0;
  }

  /**
   * Clear Overflow Flag
   */
  CLV: OpCodeFunc = oper => {
    this.V = 0;
    return 0;
  }

  /**
   * Compare Memory with Accumulator
   */
  CMP: OpCodeFunc = oper => {
    const result = this.A - oper;
    this.C = (result >= 0) ? 1 : 0;
    this.N = ((result >> 7) & 1) === 1 ? 1 : 0;
    this.Z = (result & 0xff) === 0 ? 1 : 0;
    return 0;
  }

  /**
   * Compare Memory and Index X
   */
  CPX: OpCodeFunc = oper => {
    const result = this.X - oper;
    this.C = (result >= 0) ? 1 : 0;
    this.N = ((result >> 7) & 1) === 1 ? 1 : 0;
    this.Z = (result & 0xff) === 0 ? 1 : 0;
    return 0;
  }

  /**
   * Compare Memory and Index Y
   */
  CPY: OpCodeFunc = oper => {
    const result = this.Y - oper;
    this.C = (result >= 0) ? 1 : 0;
    this.N = ((result >> 7) & 1) === 1 ? 1 : 0;
    this.Z = (result & 0xff) === 0 ? 1 : 0;
    return 0;
  }

  /**
   * Decrement Memory by One
   */
  // DEC: OpCodeFunc = oper => {

  // }
}

export default CPU;
