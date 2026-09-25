// Build-time virtual module stub for unit tests. The real
// `virtual:custom-fonts` map is provided by customFontsPlugin during vite
// builds; tests run without plugins, so custom fonts resolve to empty.
const CUSTOM_FONTS_MAP: Record<string, string> = {}
export default CUSTOM_FONTS_MAP
