# signal / dig crate

Dashboard personal de digging para DJ, enfocado en recomendaciones de House y Techno de Bandcamp y Beatport.

## Qué incluye

- Feed combinado de Bandcamp Discover y los rankings Top 100 de Beatport.
- Filtros por tienda y género, además de orden por señal, precio o BPM.
- Precios públicos por lanzamiento en Bandcamp y por pista en Beatport.
- Metadatos de BPM, tonalidad, duración y sello cuando están disponibles.
- Corazones persistentes en el navegador mediante `localStorage`.
- Crate con presupuesto acumulado por moneda y exportación a texto.
- Reproductor oficial de Bandcamp para los lanzamientos que permiten streaming.
- Enlaces oficiales de búsqueda/compra en ambas tiendas.

## Exactitud de la señal

Bandcamp no publica el número exacto de descargas. La app usa el orden público `top` de Discover y lo identifica como señal `best-selling`. Beatport sí presenta rankings Top 100 por género; el snapshot conserva posición, precio, BPM y tonalidad visibles públicamente.

Las monedas no se convierten entre sí: el total muestra USD, EUR y GBP por separado para evitar una suma incorrecta. Los precios pueden cambiar y no incluyen impuestos.

Los corazones guardan el crate dentro de esta app. Bandcamp y Beatport no ofrecen a esta app estática una API pública para escribir directamente en la wishlist de la cuenta del usuario; el enlace de cada item lleva a la tienda oficial para completar la compra o la acción de cuenta.

## Actualizar el snapshot

```powershell
python scripts\build_recommendations.py
```

El script consulta Bandcamp Discover, obtiene el precio público de cada lanzamiento y combina esos datos con el snapshot verificado de Beatport. Cuando cambie el chart de Beatport, actualiza la constante `BEATPORT` del script con la información del Top 100 oficial y vuelve a ejecutarlo.

## Ejecutar localmente

Haz doble clic en `START_SIGNAL.cmd`, o ejecuta:

```powershell
python scripts\serve.py
```

La app abre en `http://127.0.0.1:4188`.

## Publicación

Cada actualización de la rama `main` se despliega automáticamente en GitHub Pages mediante `.github/workflows/pages.yml`.
