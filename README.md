# signal / lecoke

Reproductor web personal construido a partir del historial público de Last.fm de `lecoke`.

## Qué incluye

- 57.556 scrobbles y 2.639 artistas convertidos en mezclas personales.
- Señales dedicadas a tu ADN musical, artistas británicos, electrónica 2026 y archivo 2009.
- 124 lanzamientos de la colección y 111 de la wishlist pública de Bandcamp `okefm`.
- Reproducción completa mediante los reproductores oficiales de Bandcamp cuando el artista la habilita.
- Cola continua de streams públicos habilitados por el artista: sigue la siguiente pista del álbum y después el siguiente lanzamiento.
- Corazón de Bandcamp con confirmación dentro del panel oficial para registrar el lanzamiento en la wishlist de `okefm`.
- “Dig mode” aleatorio para descubrir sonidos y referencias de house/techno.
- Rankings internos de House y Techno basados en la señal pública `top` de Bandcamp Discover.
- Actualizador reproducible para colección, wishlist y charts de Discover.
- Búsqueda en Bandcamp primero y previews oficiales de Apple/iTunes como respaldo.
- Carga de archivos de audio propios para reproducción completa en el navegador.
- Cola, favoritos, controles de volumen, reproducción aleatoria y repetición.
- Diseño adaptable para escritorio y móvil.

## Reproducción y derechos

La aplicación no bloquea anuncios ni elude las reglas de ningún servicio. La reproducción completa usa los streams públicos que Bandcamp entrega para ese lanzamiento, el reproductor oficial de Bandcamp o archivos locales aportados por el usuario. Las previews de Apple/iTunes se conservan únicamente como respaldo. La disponibilidad de cada pista depende de lo habilitado por el artista o sello. La lectura de la página pública usa AllOrigins como proxy CORS y vuelve al reproductor oficial si ese servicio o el stream no están disponibles.

Bandcamp no ofrece una API pública para modificar la wishlist de una cuenta fan. Por eso el corazón abre la página oficial dentro de la app y el usuario confirma allí el corazón de Bandcamp; la app nunca guarda contraseñas ni intenta reutilizar cookies de la cuenta.

## Ejecutar localmente

Haz doble clic en `START_SIGNAL.cmd`, o ejecuta:

```powershell
python scripts\serve.py
```

El servidor abre `http://127.0.0.1:4188` y habilita la cola continua estable sin guardar cookies ni credenciales de Bandcamp.

Para volver a sincronizar la colección pública de Bandcamp:

```powershell
python scripts\import_bandcamp.py okefm
```

Bandcamp no expone conteos públicos exactos de escuchas o descargas. La app presenta su orden público de Discover (`top`/best-selling) y lo identifica expresamente como tal.

Los charts se actualizan al ejecutar el importador antes de publicar. Bandcamp bloquea este endpoint desde los runners compartidos de GitHub Actions, por lo que no se incluye un workflow programado que fallaría de forma recurrente.

## Publicación

Cada actualización de la rama `main` se despliega automáticamente en GitHub Pages mediante el workflow incluido en `.github/workflows/pages.yml`.

