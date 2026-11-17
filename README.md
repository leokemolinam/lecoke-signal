# signal / lecoke

Reproductor web personal construido a partir del historial público de Last.fm de `lecoke`.

## Qué incluye

- 57.556 scrobbles y 2.639 artistas convertidos en mezclas personales.
- Señales dedicadas a tu ADN musical, artistas británicos, electrónica 2026 y archivo 2009.
- 124 lanzamientos de la colección y 111 de la wishlist pública de Bandcamp `okefm`.
- Reproducción completa mediante los reproductores oficiales de Bandcamp cuando el artista la habilita.
- “Dig mode” aleatorio para descubrir sonidos y referencias de house/techno.
- Rankings internos de House y Techno basados en la señal pública `top` de Bandcamp Discover.
- Actualización automática de colección, wishlist y charts cada 12 horas.
- Búsqueda en Bandcamp primero y previews oficiales de Apple/iTunes como respaldo.
- Carga de archivos de audio propios para reproducción completa en el navegador.
- Cola, favoritos, controles de volumen, reproducción aleatoria y repetición.
- Diseño adaptable para escritorio y móvil.

## Reproducción y derechos

La aplicación no bloquea anuncios ni elude las reglas de ningún servicio. La reproducción completa usa el reproductor oficial de Bandcamp o archivos locales aportados por el usuario. Las previews de Apple/iTunes se conservan únicamente como respaldo. La disponibilidad de cada pista depende de lo habilitado por el artista o sello.

## Ejecutar localmente

```powershell
python -m http.server 4188 --directory dist
```

Después abre `http://127.0.0.1:4188`.

Para volver a sincronizar la colección pública de Bandcamp:

```powershell
python scripts\import_bandcamp.py okefm
```

Bandcamp no expone conteos públicos exactos de escuchas o descargas. La app presenta su orden público de Discover (`top`/best-selling) y lo identifica expresamente como tal.

## Publicación

Cada actualización de la rama `main` se despliega automáticamente en GitHub Pages mediante el workflow incluido en `.github/workflows/pages.yml`.

