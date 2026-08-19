"use client";

import { useState, useTransition } from "react";
import { Bot, Send } from "lucide-react";

interface AskCopilotBoxProps {
  title: string;
  subtitle: string;
  scopeLabel: string;
  placeholder: string;
  examples: string[];
  action: (question: string) => Promise<{ ok: true; answer: string } | { ok: false; error: string }>;
}

interface ThreadEntry {
  role: "user" | "assistant";
  text: string;
  isError?: boolean;
}

// Caja embebida directo en la página (Reportes o Inventario), sin panel ni
// drawer aparte — decisión de producto explícita después de dos iteraciones
// rechazadas (botón flotante, ícono de sidebar + drawer): tiene que sentirse
// parte del contenido de la página, no "otra cosa". Cada instancia recibe su
// propia Server Action ya acotada a un solo módulo (ver
// askReportsCopilotAction / askInventoryCopilotAction) — este componente no
// sabe ni le importa qué hay del otro lado, solo manda la pregunta y muestra
// la respuesta.
export function AskCopilotBox({ title, subtitle, scopeLabel, placeholder, examples, action }: AskCopilotBoxProps) {
  const [question, setQuestion] = useState("");
  const [thread, setThread] = useState<ThreadEntry[]>([]);
  const [isPending, startTransition] = useTransition();

  function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed || isPending) return;

    setThread((prev) => [...prev, { role: "user", text: trimmed }]);
    setQuestion("");

    startTransition(async () => {
      const result = await action(trimmed);
      setThread((prev) => [
        ...prev,
        result.ok
          ? { role: "assistant", text: result.answer }
          : { role: "assistant", text: result.error, isError: true },
      ]);
    });
  }

  return (
    <div className="panel mb-6">
      <div className="flex items-center gap-2">
        <Bot className="h-4 w-4 text-pine" aria-hidden />
        <h2 className="section-title text-sm">{title}</h2>
        <span className="badge badge-pine ml-auto">{scopeLabel}</span>
      </div>
      <p className="mt-1 text-xs text-ink/45">{subtitle}</p>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          send(question);
        }}
        className="mt-3 flex gap-2"
      >
        <input
          type="text"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder={placeholder}
          disabled={isPending}
          className="field-input mt-0 flex-1"
        />
        <button type="submit" disabled={isPending || !question.trim()} className="btn-primary shrink-0">
          <Send className="h-3.5 w-3.5" aria-hidden />
          Preguntar
        </button>
      </form>

      {thread.length === 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {examples.map((example) => (
            <button
              key={example}
              type="button"
              onClick={() => send(example)}
              disabled={isPending}
              className="badge badge-pine cursor-pointer transition hover:bg-pine/25 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {example}
            </button>
          ))}
        </div>
      )}

      {thread.length > 0 && (
        <div className="mt-4 space-y-2.5 border-t border-sage-dark/25 pt-3">
          {thread.map((entry, i) =>
            entry.role === "user" ? (
              <p key={i} className="text-xs text-ink/45">
                <span className="font-mono uppercase tracking-wide">Preguntaste — </span>
                {entry.text}
              </p>
            ) : (
              <p
                key={i}
                className={`rounded-lg border-l-2 py-2 pl-3 pr-2 text-sm leading-relaxed ${
                  entry.isError
                    ? "border-berry bg-berry/5 text-berry-dark"
                    : "border-pine bg-paper text-ink"
                }`}
              >
                {entry.text}
              </p>
            )
          )}
          {isPending && (
            <p className="rounded-lg border-l-2 border-pine bg-paper py-2 pl-3 pr-2 text-sm text-ink/40">
              Pensando…
            </p>
          )}
        </div>
      )}
    </div>
  );
}
