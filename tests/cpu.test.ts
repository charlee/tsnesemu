import CPU from '../src/cpu';

test('init cpu', () => {
  const cpu = new CPU(new Uint8Array());
  expect(cpu).toBeTruthy();
})