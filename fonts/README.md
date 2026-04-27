# Fonts

This folder contains fonts bundled into local and production builds.

Before launch, review licenses for every bundled font and keep personal or commercial fonts out of git. The root `.gitignore` excludes known personal font filename prefixes, and local-only fonts can also be supplied with `CUSTOM_FONTS_DIR`.

## Bundled Font Files

- `Doto-Regular.ttf`
- `Goldman-Regular.ttf`
- `Junction-bold.otf`
- `Junction-light.otf`
- `Junction-regular.otf`
- `MomoTrustDisplay-Regular.ttf`
- `MonaspaceKrypton-ExtraBold.otf`
- `MonaspaceKrypton-ExtraLight.otf`
- `MonaspaceKrypton-Regular.otf`
- `Orbitron Black.ttf`
- `Orbitron Light.ttf`
- `OstrichSans-Black.otf`
- `OstrichSans-Light.otf`
- `OstrichSansRounded-Medium.otf`
- `redacted-script-bold.ttf`
- `ScienceGothic-Regular.ttf`

## Launch Rule

Do not add a new font file unless its license permits redistribution in this project. If a font is only personally licensed, keep it outside the repo and load it through `CUSTOM_FONTS_DIR`.
