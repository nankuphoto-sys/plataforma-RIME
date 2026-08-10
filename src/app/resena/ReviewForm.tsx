"use client";

import { useState } from "react";
import { StarRating } from "@/components/ui/StarRating";
import { submitReviewAction } from "./actions";

export function ReviewForm({ token }: { token: string }) {
  const [rating, setRating] = useState(0);

  return (
    <form action={submitReviewAction.bind(null, token)} className="mt-6 space-y-4">
      <input type="hidden" name="rating" value={rating} />

      <div>
        <p className="field-label">Tu calificación</p>
        <div className="mt-1">
          <StarRating value={rating} onChange={setRating} size="md" />
        </div>
      </div>

      <div>
        <label htmlFor="comment" className="field-label">
          Comentario (opcional)
        </label>
        <textarea id="comment" name="comment" rows={4} maxLength={1000} className="field-input" />
      </div>

      <button type="submit" disabled={rating === 0} className="btn-primary w-full disabled:opacity-50">
        Enviar reseña
      </button>
    </form>
  );
}
