import { afterEach, describe, expect, it } from "vitest";
import {
  buildLowStockAlertTemplatePayload,
  buildReminderTemplatePayload,
  normalizePhoneForWhatsapp,
} from "./whatsapp";

describe("normalizePhoneForWhatsapp", () => {
  it("deja solo dígitos, quitando +, espacios y guiones", () => {
    expect(normalizePhoneForWhatsapp("+57 300 123 4567")).toBe("573001234567");
  });

  it("deja un número que ya viene solo con dígitos igual", () => {
    expect(normalizePhoneForWhatsapp("3001234567")).toBe("3001234567");
  });

  it("devuelve null para un string vacío", () => {
    expect(normalizePhoneForWhatsapp("")).toBeNull();
  });

  it("devuelve null si quedan menos de 8 dígitos", () => {
    expect(normalizePhoneForWhatsapp("+1 234")).toBeNull();
  });
});

describe("buildReminderTemplatePayload", () => {
  const originalName = process.env.WHATSAPP_REMINDER_TEMPLATE_NAME;
  const originalLang = process.env.WHATSAPP_REMINDER_TEMPLATE_LANG;

  afterEach(() => {
    if (originalName === undefined) delete process.env.WHATSAPP_REMINDER_TEMPLATE_NAME;
    else process.env.WHATSAPP_REMINDER_TEMPLATE_NAME = originalName;
    if (originalLang === undefined) delete process.env.WHATSAPP_REMINDER_TEMPLATE_LANG;
    else process.env.WHATSAPP_REMINDER_TEMPLATE_LANG = originalLang;
  });

  it("arma el body exacto esperado por la API de Meta", () => {
    process.env.WHATSAPP_REMINDER_TEMPLATE_NAME = "recordatorio_cita";
    process.env.WHATSAPP_REMINDER_TEMPLATE_LANG = "es_MX";

    const payload = buildReminderTemplatePayload({
      to: "573001234567",
      clientName: "María Pérez",
      serviceName: "Primera consulta",
      startsAtLabel: "jueves 30 de julio a las 09:50",
    });

    expect(payload).toEqual({
      messaging_product: "whatsapp",
      to: "573001234567",
      type: "template",
      template: {
        name: "recordatorio_cita",
        language: { code: "es_MX" },
        components: [
          {
            type: "body",
            parameters: [
              { type: "text", text: "María Pérez" },
              { type: "text", text: "Primera consulta" },
              { type: "text", text: "jueves 30 de julio a las 09:50" },
            ],
          },
        ],
      },
    });
  });

  it("usa los defaults si no hay variables de entorno configuradas", () => {
    delete process.env.WHATSAPP_REMINDER_TEMPLATE_NAME;
    delete process.env.WHATSAPP_REMINDER_TEMPLATE_LANG;

    const payload = buildReminderTemplatePayload({
      to: "573001234567",
      clientName: "María Pérez",
      serviceName: "Primera consulta",
      startsAtLabel: "jueves 30 de julio a las 09:50",
    });

    expect((payload.template as { name: string }).name).toBe("recordatorio_cita");
    expect((payload.template as { language: { code: string } }).language.code).toBe("es_MX");
  });
});

describe("buildLowStockAlertTemplatePayload", () => {
  const originalName = process.env.WHATSAPP_LOW_STOCK_TEMPLATE_NAME;
  const originalLang = process.env.WHATSAPP_LOW_STOCK_TEMPLATE_LANG;

  afterEach(() => {
    if (originalName === undefined) delete process.env.WHATSAPP_LOW_STOCK_TEMPLATE_NAME;
    else process.env.WHATSAPP_LOW_STOCK_TEMPLATE_NAME = originalName;
    if (originalLang === undefined) delete process.env.WHATSAPP_LOW_STOCK_TEMPLATE_LANG;
    else process.env.WHATSAPP_LOW_STOCK_TEMPLATE_LANG = originalLang;
  });

  it("arma el body exacto esperado por la API de Meta", () => {
    process.env.WHATSAPP_LOW_STOCK_TEMPLATE_NAME = "alerta_stock_bajo";
    process.env.WHATSAPP_LOW_STOCK_TEMPLATE_LANG = "es_MX";

    const payload = buildLowStockAlertTemplatePayload({
      to: "573001234567",
      itemName: "Guantes de nitrilo",
      currentStock: 2,
      unit: "caja",
      locationName: "Sede Principal",
    });

    expect(payload).toEqual({
      messaging_product: "whatsapp",
      to: "573001234567",
      type: "template",
      template: {
        name: "alerta_stock_bajo",
        language: { code: "es_MX" },
        components: [
          {
            type: "body",
            parameters: [
              { type: "text", text: "Guantes de nitrilo" },
              { type: "text", text: "2 caja" },
              { type: "text", text: "Sede Principal" },
            ],
          },
        ],
      },
    });
  });

  it("usa los defaults si no hay variables de entorno configuradas", () => {
    delete process.env.WHATSAPP_LOW_STOCK_TEMPLATE_NAME;
    delete process.env.WHATSAPP_LOW_STOCK_TEMPLATE_LANG;

    const payload = buildLowStockAlertTemplatePayload({
      to: "573001234567",
      itemName: "Guantes de nitrilo",
      currentStock: 2,
      unit: "caja",
      locationName: "Sede Principal",
    });

    expect((payload.template as { name: string }).name).toBe("alerta_stock_bajo");
    expect((payload.template as { language: { code: string } }).language.code).toBe("es_MX");
  });
});
