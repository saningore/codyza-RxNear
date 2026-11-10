"use client";

export default function ErrorPage({ reset }: { error: Error; reset: () => void }) {
  return (
    <article className="mx-auto max-w-3xl px-4 py-16">
      <h1 className="font-serif text-4xl font-semibold">This page could not be loaded</h1>
      <p className="mt-3 text-lg">The public record service did not respond. Try the search again.</p>
      <button className="mt-6 min-h-11 rounded-full bg-pine px-5 py-3 font-semibold text-card" type="button" onClick={() => reset()}>Try again</button>
    </article>
  );
}
