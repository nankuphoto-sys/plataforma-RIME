import { ArrowRight } from "lucide-react";
import Link from "next/link";

// Mismo tratamiento oscuro que el Hero (bg-ink + resplandor pine) para
// cerrar la página con la misma energía con la que arrancó, en vez de
// terminar en un tono claro y bajo que se siente anticlimático.
export function FinalCta() {
  return (
    <section className="relative overflow-hidden bg-ink">
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-1/2 h-96 w-96 -translate-x-1/2 -translate-y-1/2 rounded-full bg-pine/25 blur-[110px]"
      />
      <div className="relative mx-auto max-w-3xl px-6 py-20 text-center">
        <h2 className="font-display text-3xl font-bold tracking-tight text-paper sm:text-4xl">
          Dale a tu consultorio la agenda que se merece
        </h2>
        <p className="mt-3 text-base text-paper/70">Crea tu cuenta gratis y agenda tu primera cita hoy mismo.</p>
        <Link href="/signup" className="btn-hero-primary mt-8 inline-flex">
          Regístrate gratis
          <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
    </section>
  );
}
