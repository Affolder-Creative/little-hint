import { Component, Suspense, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { Empty } from "./components";

export class PageBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    if (this.state.failed)
      return (
        <Empty
          page
          title="This page couldn't load"
          action={
            <div className="actions">
              <button className="button" onClick={() => location.reload()}>
                Reload page
              </button>
              <Link className="button secondary" to="/">
                Back home
              </Link>
            </div>
          }
        >
          Check your connection, then reload to try again. You can also return
          home and keep browsing.
        </Empty>
      );
    return (
      <Suspense
        fallback={
          <div role="status" aria-live="polite">
            <h1>Loading page…</h1>
          </div>
        }
      >
        {this.props.children}
      </Suspense>
    );
  }
}
