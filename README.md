# signal / lecoke

Reproductor web personal construido a partir del historial público de Last.fm de `lecoke`.

## Qué incluye

- 57.556 scrobbles y 2.639 artistas convertidos en mezclas personales.
- Señales dedicadas a tu ADN musical, artistas británicos, electrónica 2026 y archivo 2009.
- Búsqueda y reproducción de previews oficiales disponibles en el catálogo de Apple/iTunes.
- Carga de archivos de audio propios para reproducción completa en el navegador.
- Cola, favoritos, controles de volumen, reproducción aleatoria y repetición.
- Diseño adaptable para escritorio y móvil.

## Reproducción y derechos

La aplicación no bloquea anuncios ni elude las reglas de ningún servicio. Reproduce previews oficiales cuando están disponibles y archivos locales aportados por el usuario. Los enlaces a canciones completas abren el servicio autorizado correspondiente, sujeto a sus condiciones y suscripción.

## Ejecutar localmente

```powershell
python -m http.server 4188 --directory dist
```

Después abre `http://127.0.0.1:4188`.

## Publicación

Cada actualización de la rama `main` se despliega automáticamente en GitHub Pages mediante el workflow incluido en `.github/workflows/pages.yml`.

