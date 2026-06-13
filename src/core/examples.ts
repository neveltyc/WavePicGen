/** Built-in example sources, shown in the Examples menu and used as defaults. */
export interface Example {
  id: string;
  title: string;
  source: string;
}

export const examples: Example[] = [
  {
    id: 'basic',
    title: 'Basics: clock, levels & data',
    source: `{
  // WavePicGen source — WaveJSON / JSON5 (comments allowed)
  signal: [
    { name: 'clk',  wave: 'P.P.P.P.P.' },
    { name: 'req',  wave: '0.1...0...' },
    { name: 'addr', wave: 'x.=.=.=.x.', data: ['0x10', '0x14', '0x18'] },
    { name: 'data', wave: 'x...=.=.x.', data: ['D0', 'D1'] },
    { name: 'ack',  wave: '0...1...0.' },
  ],
  head: { text: 'Figure 1 — Basic read transaction', tick: 0 },
  config: { hscale: 1 },
}`,
  },
  {
    id: 'bus',
    title: 'Bus, high-Z, undefined & gaps',
    source: `{
  signal: [
    { name: 'clk',   wave: 'p........' },
    { name: 'en',    wave: '01.....0.' },
    { name: 'bus',   wave: 'z.=.=.=.z', data: ['A', 'B', 'C'] },
    { name: 'state', wave: 'x.3.4.5.x', data: ['IDLE', 'RUN', 'DONE'] },
    {},
    { name: 'burst', wave: '0.1.|..0.' },
  ],
  head: { text: 'Bus cycle with high-Z, states and a gap' },
}`,
  },
  {
    id: 'groups',
    title: 'Grouped signals',
    source: `{
  signal: [
    { name: 'clk', wave: 'P.P.P.P.' },
    ['control',
      { name: 'we', wave: '0.1...0.' },
      { name: 're', wave: '01....0.' },
    ],
    ['datapath',
      { name: 'addr', wave: 'x=..=..x', data: ['A0', 'A1'] },
      { name: 'data', wave: 'x.=..=.x', data: ['D0', 'D1'] },
    ],
  ],
  head: { text: 'Grouped control & datapath', tick: 0 },
}`,
  },
  {
    id: 'phase',
    title: 'Period & phase (sub-cycle taste)',
    source: `{
  signal: [
    { name: 'clk',   wave: 'p.......', period: 1 },
    { name: 'clk/2', wave: 'p...',     period: 2 },
    { name: 'd',     wave: '0.1.0.1.', phase: 0.5 },
    { name: 'q',     wave: '0..1.0.1', phase: 0.5 },
  ],
  head: { text: 'Divided clock and phase-shifted data' },
}`,
  },
];

export const defaultSource: string = examples[0]!.source;
