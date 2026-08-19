import Link from "next/link";
import { PLAN_OPTIONS, describePlan } from "@/lib/planDisplay";
import { formatCOP } from "@/lib/currency";

export function PricingStrip() {
  return (
    <section id="precios" className="mx-auto max-w-7xl px-6 py-16">
      <div className="mx-auto max-w-xl text-center">
        <h2 className="section-title text-2xl">Precio transparente, sin sorpresas</h2>
        <p className="page-subtitle mt-2">
          Un plan fijo por mes. Sin comisión sobre tus citas ni cobros extra por WhatsApp.
        </p>
      </div>

      <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {PLAN_OPTIONS.map((plan) => {
          const isPopular = plan.value === "PREMIUM";
          return (
            <div
              key={plan.value}
              className={
                isPopular
                  ? "relative flex scale-[1.03] flex-col rounded-xl border-2 border-pine bg-white p-4 shadow-lg shadow-pine/15 transition-shadow duration-150 hover:shadow-xl"
                  : "panel flex flex-col"
              }
            >
              {isPopular && (
                <span className="badge badge-pine absolute -top-3 left-1/2 -translate-x-1/2">Más elegido</span>
              )}
              <p className="text-sm font-semibold text-ink">{plan.label}</p>
              <p className="mt-2 font-display text-2xl font-semibold text-pine">
                {formatCOP(plan.priceCop)}
                <span className="text-sm font-normal text-ink/50">/mes</span>
              </p>
              <p className="mt-2 flex-1 text-xs leading-relaxed text-ink/55">{describePlan(plan)}</p>
              <Link
                href="/signup"
                className={isPopular ? "btn-primary mt-4 justify-center" : "btn-secondary-sm mt-4 justify-center"}
              >
                Regístrate gratis
              </Link>
            </div>
          );
        })}
      </div>
    </section>
  );
}
