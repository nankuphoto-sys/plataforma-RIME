import { generateText, stepCountIs, tool } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { computeReportData, computeInventoryConsumption } from "@/lib/reports";

// Nivel 1 del Copiloto RIME: solo lectura, nunca escribe en la base ni
// dispara comunicaciones. Cada caja (Reportes / Inventario) recibe SOLO el
// set de herramientas de su propio módulo — el modelo no puede responder
// sobre algo que no tiene una herramienta para consultar, así que el
// aislamiento entre cajas queda garantizado por lo que existe, no solo por
// una instrucción de prompt que se podría ignorar.
//
// El modelo nunca ve ni elige tenantId/locationId: quien llama (la Server
// Action, después de pasar por requireReportsAccess/requireInventoryAccess)
// ya los resolvió y quedan cerrados sobre cada herramienta antes de
// invocar al modelo.

const MODEL = anthropic("claude-sonnet-4-5");

type Period = "today" | "month" | "year";

function resolvePeriod(period: Period): { from: Date; to: Date; label: string } {
  const now = new Date();
  if (period === "today") {
    const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    return { from, to: now, label: "hoy" };
  }
  if (period === "year") {
    const from = new Date(Date.UTC(now.getUTCFullYear(), 0, 1));
    return { from, to: now, label: "en lo que va del año" };
  }
  const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  return { from, to: now, label: "este mes" };
}

const periodSchema = z
  .enum(["today", "month", "year"])
  .describe("Rango de tiempo: 'today' (hoy), 'month' (mes calendario actual) o 'year' (año calendario actual).");

function buildReportsTools(tenantId: string) {
  return {
    getRevenueSummary: tool({
      description:
        "Ingresos confirmados y estado de las citas del negocio para un período (hoy, este mes, o este año).",
      inputSchema: z.object({ period: periodSchema }),
      execute: async ({ period }) => {
        const { from, to, label } = resolvePeriod(period);
        const professionals = await prisma.professional.findMany({
          where: { tenantId },
          select: { id: true, name: true, commissionRate: true },
        });
        const data = await computeReportData(tenantId, professionals, from, to);
        return {
          periodLabel: label,
          statusCounts: data.statusCountsByStatus,
          revenueByProvider: data.revenueRows,
          commissionByProfessional: data.commissionRows.map((row) => ({
            name: row.name,
            totalServiceRevenue: row.totalServiceRevenue,
            pendingCommissionAmount: row.pendingCommissionAmount,
          })),
        };
      },
    }),
  };
}

function buildInventoryTools(tenantId: string, locationId: string) {
  return {
    getCurrentStock: tool({
      description: "Stock actual de todos los ítems de inventario activos en la sede del negocio.",
      inputSchema: z.object({}),
      execute: async () => {
        const items = await prisma.inventoryItem.findMany({
          where: { tenantId, active: true },
          include: { stockLevels: { where: { locationId } } },
          orderBy: { name: "asc" },
        });
        return items.map((item) => ({
          name: item.name,
          unit: item.unit,
          quantity: item.stockLevels[0]?.quantity ?? 0,
          lowStockThreshold: item.lowStockThreshold,
        }));
      },
    }),
    getLowStockItems: tool({
      description: "Ítems de inventario en su umbral de stock bajo o por debajo, en la sede del negocio.",
      inputSchema: z.object({}),
      execute: async () => {
        const items = await prisma.inventoryItem.findMany({
          where: { tenantId, active: true },
          include: { stockLevels: { where: { locationId } } },
          orderBy: { name: "asc" },
        });
        return items
          .map((item) => ({
            name: item.name,
            unit: item.unit,
            quantity: item.stockLevels[0]?.quantity ?? 0,
            lowStockThreshold: item.lowStockThreshold,
          }))
          .filter((item) => item.quantity <= item.lowStockThreshold);
      },
    }),
    getInventoryConsumption: tool({
      description: "Consumo de insumos (salidas de stock) del negocio en un período (hoy, este mes, o este año).",
      inputSchema: z.object({ period: periodSchema }),
      execute: async ({ period }) => {
        const { from, to, label } = resolvePeriod(period);
        const rows = await computeInventoryConsumption(tenantId, from, to);
        return {
          periodLabel: label,
          items: rows.map((row) => ({
            name: row.itemName,
            unit: row.unit,
            totalQuantity: row.totalQuantity,
          })),
        };
      },
    }),
  };
}

const BASE_INSTRUCTIONS = `Eres el Copiloto RIME, un asistente interno de solo lectura para el dueño o
el staff de un negocio que usa la plataforma RIME (agendamiento y CRM).
Responde siempre en español neutro latinoamericano (tuteo: "tú/tienes/puedes",
nunca "vos/tenés/podés"), en un tono cercano, breve y directo.

Reglas estrictas:
- Responde en texto plano, SIN formato Markdown (nada de **negrita**,
  # títulos, listas con "-" ni bloques de código) — el texto se muestra
  tal cual en la interfaz, que no interpreta Markdown.
- Solo puedes responder usando las herramientas que tienes disponibles.
  Nunca inventes números ni datos que no hayas consultado con una
  herramienta.
- Si la pregunta no se puede responder con las herramientas disponibles
  (por ejemplo, te preguntan por clientes, citas puntuales, empleados, o
  cualquier otro tema fuera de tu alcance), dilo directo y claro: no
  intentes adivinar ni respondas con generalidades. Sugiere en una frase
  corta dónde sí podría resolverlo (la sección correspondiente del
  dashboard), sin inventar nombres de pantallas que no existan.
- Respuestas cortas (2-4 líneas), con los números concretos que se
  pidieron. Nada de relleno ni disculpas innecesarias.`;

async function askCopilot(
  tools: Parameters<typeof generateText>[0]["tools"],
  scopeInstructions: string,
  question: string
): Promise<string> {
  const result = await generateText({
    model: MODEL,
    system: `${BASE_INSTRUCTIONS}\n\n${scopeInstructions}`,
    prompt: question,
    tools,
    stopWhen: stepCountIs(3),
  });
  return result.text.trim();
}

export async function askReportsCopilot(tenantId: string, question: string): Promise<string> {
  return askCopilot(
    buildReportsTools(tenantId),
    "Tu alcance ahora mismo es SOLO Reportes: ingresos, estado de citas y comisiones por profesional. No respondas sobre inventario, clientes ni ninguna otra cosa.",
    question
  );
}

export async function askInventoryCopilot(
  tenantId: string,
  locationId: string,
  question: string
): Promise<string> {
  return askCopilot(
    buildInventoryTools(tenantId, locationId),
    "Tu alcance ahora mismo es SOLO Inventario: stock actual, ítems bajo su umbral de alerta, y consumo de insumos. Si te preguntan sobre facturación, ingresos o citas, di explícitamente que eso es de Reportes y que pregunten ahí — no intentes responderlo.",
    question
  );
}
