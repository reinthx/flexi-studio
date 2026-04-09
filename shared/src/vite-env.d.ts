// Type declarations for Vite virtual modules used in this project

declare module 'virtual:custom-fonts' {
  /** Map of font-family name → relative path (e.g. "./assets/fonts/Foo.ttf") */
  const fonts: Record<string, string>
  export default fonts
}
