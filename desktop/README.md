# SampledHead Desktop

Versiones de escritorio (Windows y Mac) de todas las apps de Sampled Head.

**Descargar:** https://github.com/sampledhead-dot/SH-apps/releases/latest

## Compilar
Automático en GitHub Actions (`.github/workflows/desktop.yml`). Para probar en local:

```bash
cd desktop
npm ci
node scripts/prepare.js tuner ../ruta/al/repo/Sampledhead-tuner build/tuner
npx electron build/tuner                       # abrir sin empaquetar
npx electron-builder --projectDir build/tuner  # instalador del sistema actual
node scripts/selftest.js build/tuner           # autoprueba
```

Detalles en `HOJA_DE_PROYECTO.md`.
