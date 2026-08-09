const FAQS = [
  {
    question: "¿Cómo protegen los datos clínicos de mis pacientes?",
    answer:
      "Cada clínica es un espacio aislado (multi-tenant): tus datos nunca se cruzan con los de otro negocio. Las contraseñas se guardan cifradas y los permisos se validan por sede, no solo por cuenta.",
  },
  {
    question: "¿Hay costos ocultos por usar WhatsApp o pasarela de pago?",
    answer:
      "No. Los recordatorios por WhatsApp y los pagos con Stripe o Wompi están incluidos en tu plan mensual, sin comisión adicional por cita ni cargo sorpresa.",
  },
  {
    question: "¿Puedo migrar mis pacientes desde otro software o desde Excel?",
    answer:
      "Sí. Podés crear tus clientes manualmente desde el panel de administración; si tenés un volumen grande, contáctanos y te ayudamos con la carga inicial.",
  },
  {
    question: "¿Qué pasa si mi clínica tiene más de una sede?",
    answer:
      "Los permisos por sede vienen incluidos desde el plan más básico: podés asignar profesionales y personal a sedes específicas, sin que uno vea la agenda del otro.",
  },
  {
    question: "¿Cómo confirman un pago? ¿Tengo que revisarlo a mano?",
    answer:
      "No. La confirmación llega por webhook en tiempo real apenas se aprueba el pago — la cita se confirma sola, sin que tengas que revisar nada manualmente.",
  },
  {
    question: "¿Qué soporte tengo si algo falla?",
    answer:
      "Todos los planes incluyen soporte por email; el plan Pro suma soporte prioritario.",
  },
  {
    question: "¿Puedo cambiar de plan más adelante?",
    answer:
      "Sí, el cambio de plan es self-service desde tu panel de facturación y se aplica de inmediato, con prorrateo cuando corresponde.",
  },
];

export function FAQ() {
  return (
    <section id="faq" className="mx-auto max-w-3xl px-6 py-16">
      <div className="text-center">
        <h2 className="section-title text-2xl">Preguntas frecuentes</h2>
      </div>

      <div className="mt-8 divide-y divide-sage-dark/40 rounded-xl border border-sage-dark/40 bg-white">
        {FAQS.map((faq) => (
          <details key={faq.question} className="group px-5 py-4">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-sm font-medium text-ink">
              {faq.question}
              <span className="text-ink/40 transition-transform group-open:rotate-45">+</span>
            </summary>
            <p className="mt-2 text-sm leading-relaxed text-ink/60">{faq.answer}</p>
          </details>
        ))}
      </div>
    </section>
  );
}
