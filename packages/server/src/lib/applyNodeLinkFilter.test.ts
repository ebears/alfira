import { describe, expect, mock, test } from 'bun:test';

// The filter builders are pure, but the module also imports heavy runtime
// dependencies for the applyNodeLinkFilter function. Mock them out.
void mock.module('../shared/logger', () => ({
  logger: { warn: mock(() => {}), error: mock(() => {}) },
}));
void mock.module('../utils/nodelink', () => ({
  updateNodeLinkPlayer: mock(() => Promise.resolve()),
}));
void mock.module('./config', () => ({
  getGuildId: mock(() => null),
}));
void mock.module('./lavalink', () => ({
  lavalink: { isGuildConnected: mock(() => false), getSessionId: mock(() => null) },
}));

const {
  buildCompressorFilter,
  buildKaraokeFilter,
  buildTimescaleFilter,
  buildTremoloFilter,
  buildVibratoFilter,
  buildRotationFilter,
  buildDistortionFilter,
  buildChannelMixFilter,
  buildLowPassFilter,
} = await import('./applyNodeLinkFilter');

describe('buildCompressorFilter', () => {
  test('passes through all params under "compressor" key', () => {
    const result = buildCompressorFilter({
      threshold: -20,
      ratio: 4,
      attack: 10,
      release: 100,
      gain: 5,
    });
    expect(result).toEqual({
      compressor: { threshold: -20, ratio: 4, attack: 10, release: 100, gain: 5 },
    });
  });

  test('handles zero values', () => {
    const result = buildCompressorFilter({
      threshold: 0,
      ratio: 0,
      attack: 0,
      release: 0,
      gain: 0,
    });
    expect(result.compressor.gain).toBe(0);
  });
});

describe('buildKaraokeFilter', () => {
  test('passes through all params under "karaoke" key', () => {
    const result = buildKaraokeFilter({
      level: 0.8,
      monoLevel: 0.5,
      filterBand: 220,
      filterWidth: 100,
    });
    expect(result).toEqual({
      karaoke: { level: 0.8, monoLevel: 0.5, filterBand: 220, filterWidth: 100 },
    });
  });
});

describe('buildTimescaleFilter', () => {
  test('passes through all params under "timescale" key', () => {
    const result = buildTimescaleFilter({ speed: 1.5, pitch: 1.2, rate: 1 });
    expect(result).toEqual({
      timescale: { speed: 1.5, pitch: 1.2, rate: 1 },
    });
  });

  test('normal speed is identity', () => {
    const result = buildTimescaleFilter({ speed: 1, pitch: 1, rate: 1 });
    expect(result.timescale.speed).toBe(1);
  });
});

describe('buildTremoloFilter', () => {
  test('passes through frequency and depth under "tremolo" key', () => {
    const result = buildTremoloFilter({ frequency: 5, depth: 0.7 });
    expect(result).toEqual({ tremolo: { frequency: 5, depth: 0.7 } });
  });
});

describe('buildVibratoFilter', () => {
  test('passes through frequency and depth under "vibrato" key', () => {
    const result = buildVibratoFilter({ frequency: 6, depth: 0.4 });
    expect(result).toEqual({ vibrato: { frequency: 6, depth: 0.4 } });
  });
});

describe('buildRotationFilter', () => {
  test('passes through rotationHz under "rotation" key', () => {
    const result = buildRotationFilter({ rotationHz: 0.2 });
    expect(result).toEqual({ rotation: { rotationHz: 0.2 } });
  });
});

describe('buildDistortionFilter', () => {
  test('passes through all 8 params under "distortion" key', () => {
    const result = buildDistortionFilter({
      sinOffset: 0,
      sinScale: 1,
      cosOffset: 0,
      cosScale: 1,
      tanOffset: 0,
      tanScale: 1,
      offset: 0,
      scale: 1,
    });
    expect(result).toEqual({
      distortion: {
        sinOffset: 0,
        sinScale: 1,
        cosOffset: 0,
        cosScale: 1,
        tanOffset: 0,
        tanScale: 1,
        offset: 0,
        scale: 1,
      },
    });
  });
});

describe('buildChannelMixFilter', () => {
  test('passes through all 4 params under "channelMix" key', () => {
    const result = buildChannelMixFilter({
      leftToLeft: 1,
      leftToRight: 0,
      rightToLeft: 0,
      rightToRight: 1,
    });
    expect(result).toEqual({
      channelMix: { leftToLeft: 1, leftToRight: 0, rightToLeft: 0, rightToRight: 1 },
    });
  });

  test('mono mix sets equal left and right', () => {
    const result = buildChannelMixFilter({
      leftToLeft: 0.5,
      leftToRight: 0.5,
      rightToLeft: 0.5,
      rightToRight: 0.5,
    });
    expect(result.channelMix.leftToLeft).toBe(0.5);
    expect(result.channelMix.rightToRight).toBe(0.5);
  });
});

describe('buildLowPassFilter', () => {
  test('passes through smoothing under "lowPass" key', () => {
    const result = buildLowPassFilter({ smoothing: 20 });
    expect(result).toEqual({ lowPass: { smoothing: 20 } });
  });

  test('zero smoothing is allowed', () => {
    const result = buildLowPassFilter({ smoothing: 0 });
    expect(result.lowPass.smoothing).toBe(0);
  });
});
