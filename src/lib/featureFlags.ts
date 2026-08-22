// Flag operativo (no es feature-gating por plan de negocio, ver
// planLimits.ts) para poder ocultar Stripe de la interfaz sin borrar su
// integración: la cuenta de Stripe del proyecto todavía no está verificada
// (Colombia no es un país soportado hoy), así que sus checkouts no se
// pueden completar de verdad. El código de Stripe (src/lib/stripe.ts, el
// webhook, las Server Actions de checkout) sigue intacto — esto solo
// controla si se MUESTRA en la UI. Wompi no depende de este flag.
//
// Default: habilitado. Para ocultarlo, STRIPE_ENABLED="false" en el entorno.
export const STRIPE_ENABLED = process.env.STRIPE_ENABLED !== "false";
