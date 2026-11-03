import type { ProductSource } from "../shared/model";

export function ProductSources({ sources }: { sources?: ProductSource[] }) {
  if (!sources?.length) return null;
  return (
    <div className="muted" aria-label="Product detail sources">
      <p>Details recovered from these sources.</p>
      <ul>
        {sources.map((source, index) => (
          <li key={`${source.url}-${index}`}>
            <a href={source.url} target="_blank" rel="noopener noreferrer">
              {new URL(source.url).hostname}
            </a>
            {` · ${source.fields.map((field) => (field === "image" ? "photo" : field)).join(", ")}`}
          </li>
        ))}
      </ul>
    </div>
  );
}
