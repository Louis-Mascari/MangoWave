interface ParsedPreset {
  perFrameInitEQs?: string;
  perFrameEQs?: string;
  perPixelEQs?: string;
  perPointEQs?: string;
}

interface WaveInput {
  init_eqs_str: string;
  frame_eqs_str: string;
  point_eqs_str: string;
}

interface ShapeInput {
  init_eqs_str: string;
  frame_eqs_str: string;
}

interface MilkdropParser {
  convert_preset_wave_and_shape(
    presetVersion: number,
    presetInit: string,
    perFrame: string,
    perVertex: string,
    shapes: Record<string, Record<string, string>>,
    waves: Record<string, Record<string, string>>,
  ): ParsedPreset;

  convert_basic_preset(
    presetVersion: number,
    initEQs: string,
    frameEQs: string,
    pixelEQs: string,
  ): ParsedPreset;

  make_wave_map(presetVersion: number, wave: WaveInput): ParsedPreset;

  make_shape_map(presetVersion: number, shape: ShapeInput): ParsedPreset;
}

declare const milkdropParser: MilkdropParser;
export default milkdropParser;
