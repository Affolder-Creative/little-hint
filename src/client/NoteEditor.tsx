import { lazy, Suspense, type ComponentProps } from "react";
const Editor = lazy(() =>
  import("./HelpfulNote").then((module) => ({
    default: module.HelpfulNoteEditor,
  })),
);
export function HelpfulNoteEditor(props: ComponentProps<typeof Editor>) {
  return (
    <Suspense fallback={<p role="status">Loading note editor…</p>}>
      <Editor {...props} />
    </Suspense>
  );
}
