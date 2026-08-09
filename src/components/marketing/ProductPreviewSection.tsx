import { ProductPreview } from "./ProductPreview";

// El hero pasó a ser video a pantalla completa (sin lugar para un panel
// lateral) — esta sección le da su propio espacio a la maqueta del producto
// real, justo debajo, en vez de perderla.
export function ProductPreviewSection() {
  return (
    <section className="bg-paper py-16 sm:py-20">
      <div className="mx-auto max-w-5xl px-6 text-center">
        <p className="text-xs font-semibold uppercase tracking-wide text-pine-dark">Así se ve por dentro</p>
        <h2 className="mt-2 font-display text-2xl font-bold tracking-tight text-ink sm:text-3xl">
          Tu agenda de la semana, de un vistazo
        </h2>
      </div>
      <div className="mx-auto mt-10 max-w-4xl px-6">
        <ProductPreview />
      </div>
    </section>
  );
}
