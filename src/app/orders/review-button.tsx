"use client";

import { useActionState, useEffect, useId, useRef, useState } from "react";
import { submitReview, type ReviewState } from "@/app/actions/reviews";

const LABELS = ["", "Poor", "Fair", "Good", "Very good", "Excellent"];
const MAX_COMMENT = 1000;

type Props = {
  orderId: string;
  productId: string;
  title: string;
  existing: { rating: number; comment: string | null } | null;
};

/** "Leave a Review" button that opens a dialog with a star picker and comment box. */
export function ReviewButton({ orderId, productId, title, existing }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [state, formAction, pending] = useActionState<ReviewState, FormData>(submitReview, {});
  const [rating, setRating] = useState(existing?.rating ?? 0);
  const [hover, setHover] = useState(0);
  const [comment, setComment] = useState(existing?.comment ?? "");
  const headingId = useId();

  // Close the dialog once the review is saved.
  useEffect(() => {
    if (state.ok) dialogRef.current?.close();
  }, [state]);

  const shown = hover || rating;

  return (
    <>
      <button
        type="button"
        onClick={() => dialogRef.current?.showModal()}
        className={`whitespace-nowrap rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
          existing ? "border border-border bg-surface hover:bg-muted" : "bg-accent text-white hover:bg-accent-hover"
        }`}
      >
        {existing ? `Your review: ${existing.rating}★ · Edit` : "Leave a Review"}
      </button>

      <dialog
        ref={dialogRef}
        aria-labelledby={headingId}
        className="m-auto w-[min(32rem,calc(100vw-2rem))] rounded-2xl border border-border bg-surface p-0 text-text backdrop:bg-primary/50"
      >
        <form action={formAction} className="p-6">
          <input type="hidden" name="orderId" value={orderId} />
          <input type="hidden" name="productId" value={productId} />

          <h2 id={headingId} className="text-lg font-bold">
            {existing ? "Edit your review" : "Leave a review"}
          </h2>
          <p className="mt-0.5 truncate text-sm text-text-secondary">{title}</p>

          <fieldset className="mt-5">
            <legend className="mb-2 text-sm font-medium">Your rating</legend>
            <div className="flex items-center gap-1" onMouseLeave={() => setHover(0)}>
              {[1, 2, 3, 4, 5].map((n) => (
                <label key={n} className="cursor-pointer" onMouseEnter={() => setHover(n)}>
                  <input
                    type="radio"
                    name="rating"
                    value={n}
                    checked={rating === n}
                    onChange={() => setRating(n)}
                    required
                    className="peer sr-only"
                  />
                  <span
                    aria-hidden="true"
                    className={`block text-3xl leading-none transition-colors peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-accent ${
                      n <= shown ? "text-accent" : "text-muted"
                    }`}
                  >
                    ★
                  </span>
                  <span className="sr-only">
                    {n} star{n > 1 ? "s" : ""}, {LABELS[n]}
                  </span>
                </label>
              ))}
              <span className="ml-2 text-sm text-text-secondary">{LABELS[shown]}</span>
            </div>
          </fieldset>

          <label className="mt-5 block">
            <span className="mb-1 block text-sm font-medium">
              Your review <span className="font-normal text-text-secondary">(optional)</span>
            </span>
            <textarea
              name="comment"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              rows={4}
              maxLength={MAX_COMMENT}
              placeholder="How was the fit, fabric and quality?"
              className="w-full rounded-md border border-border bg-background p-2.5 text-sm outline-none focus:border-accent"
            />
            <span className="block text-right text-xs text-text-secondary">
              {comment.length}/{MAX_COMMENT}
            </span>
          </label>

          {state.error && (
            <p role="alert" className="mt-2 rounded-md bg-error/10 p-2 text-sm text-error">
              {state.error}
            </p>
          )}

          <div className="mt-6 flex justify-end gap-3">
            <button
              type="button"
              onClick={() => dialogRef.current?.close()}
              className="rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-muted"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={pending || rating === 0}
              className="rounded-lg bg-accent px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-hover disabled:opacity-60"
            >
              {pending ? "Saving…" : existing ? "Update review" : "Submit review"}
            </button>
          </div>
        </form>
      </dialog>
    </>
  );
}
