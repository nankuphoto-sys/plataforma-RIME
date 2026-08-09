"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type AudienceKey = "especialistas" | "clinicas" | "pacientes";

const TABS: { key: AudienceKey; label: string }[] = [
  { key: "especialistas", label: "Especialistas" },
  { key: "clinicas", label: "Clínicas" },
  { key: "pacientes", label: "Pacientes" },
];

const CONTENT: Record<
  AudienceKey,
  { heading: string; bullets: string[]; cta: { href: string; label: string } | null }
> = {
  especialistas: {
    heading: "Para profesionales independientes",
    bullets: [
      "Agenda pública 24/7: tus pacientes reservan solos, sin llamadas ni WhatsApp manual.",
      "Ficha clínica según tu especialidad (psicología, nutrición, fisioterapia, estética).",
      "Cobra con Stripe o Wompi y mira la confirmación en tiempo real, no días después.",
      "Recordatorios automáticos por WhatsApp para bajar el ausentismo.",
    ],
    cta: { href: "/signup", label: "Regístrate gratis" },
  },
  clinicas: {
    heading: "Para clínicas y equipos",
    bullets: [
      "Permisos granulares por sede desde el primer día — cada rol ve solo lo suyo.",
      "Varias sedes y profesionales bajo una sola cuenta.",
      "Reportes de ingresos y comisión por profesional, exportables a CSV y PDF.",
      "Inventario de insumos con descuento automático al completar una cita.",
    ],
    cta: { href: "/signup", label: "Regístrate gratis" },
  },
  pacientes: {
    heading: "Para pacientes",
    bullets: [
      "Agenda tu cita directo desde el link de reservas de tu especialista, sin crear cuenta.",
      "Recibe un recordatorio por WhatsApp antes de tu cita.",
      "Si tu clínica lo habilita, paga en línea de forma segura y con confirmación inmediata.",
    ],
    cta: null,
  },
};

export function AudienceTabs() {
  const [active, setActive] = useState<AudienceKey>("especialistas");

  useEffect(() => {
    if (window.location.hash === "#pacientes") {
      setActive("pacientes");
    }
  }, []);

  const content = CONTENT[active];

  return (
    <section id="pacientes" className="mx-auto max-w-7xl px-6 py-16">
      <div className="mx-auto flex max-w-md justify-center gap-1 rounded-full border border-sage-dark/40 bg-white p-1.5 shadow-sm">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setActive(tab.key)}
            className={`flex-1 rounded-full px-4 py-2.5 text-sm font-semibold transition-all duration-200 ease-out ${
              active === tab.key
                ? "scale-[1.02] bg-pine text-paper shadow-md shadow-pine/25"
                : "text-ink/55 hover:bg-sage/50 hover:text-ink"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="mx-auto mt-8 max-w-2xl text-center">
        <h2 className="section-title text-2xl">{content.heading}</h2>
        <ul className="mx-auto mt-5 max-w-lg space-y-3 text-left">
          {content.bullets.map((bullet) => (
            <li key={bullet} className="flex gap-2.5 text-sm text-ink/70">
              <span className="mt-0.5 text-pine" aria-hidden>
                ✓
              </span>
              <span>{bullet}</span>
            </li>
          ))}
        </ul>

        {content.cta ? (
          <Link href={content.cta.href} className="btn-primary mt-7 inline-flex">
            {content.cta.label}
          </Link>
        ) : (
          <p className="mt-7 text-sm text-ink/50">
            Pregúntale a tu especialista o clínica por su link de reservas.
          </p>
        )}
      </div>
    </section>
  );
}
