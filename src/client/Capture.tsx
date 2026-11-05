import "./capture.css";
import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { captureLink, sharedCapture } from "../shared/capture";
import { useApp } from "./context";
import { Field, Header } from "./components";
import { GiftForm, ListForm } from "./forms";

export function Capture() {
  const { world, open } = useApp();
  const [params, setParams] = useSearchParams();
  const initial = sharedCapture(params);
  const [text, setText] = useState(initial.url);
  const [error, setError] = useState(
    !initial.url && ["url", "text", "title"].some((key) => params.has(key))
      ? "No single product link was found in this share. Paste one complete product link below."
      : "",
  );
  const [recipientId, setRecipientId] = useState("");
  const recipients = world.people.filter(
    (person) =>
      person.userId !== world.me.id && !person.guardians.includes(world.me.id),
  );
  const lists = world.lists.filter((list) => list.canEdit && !list.archived);
  function clear() {
    setText("");
    setError("");
    setParams({}, { replace: true });
  }
  return (
    <>
      <Header
        title="Capture a product"
        description="Found something you love? Bring the link here."
      />
      <form
        className="capture-form"
        onSubmit={(event) => {
          event.preventDefault();
          const url = captureLink(text);
          if (!url) {
            setError(
              "Paste one complete http:// or https:// product link. Remove any extra links.",
            );
            return;
          }
          setError("");
          open(
            recipientId ? "Review your gift idea" : "Review your item",
            <GiftForm
              recipientId={recipientId || undefined}
              capture={{ url, title: initial.url === url ? initial.title : "" }}
              onSaved={clear}
            />,
          );
        }}
      >
        <Field label="Product link or shared text">
          <textarea
            value={text}
            maxLength={8192}
            rows={3}
            required
            onChange={(event) => {
              setText(event.target.value);
              setError("");
            }}
            placeholder="Paste a product link, or the message shared by a shopping app"
          />
        </Field>
        {recipients.length > 0 && (
          <Field label="Save to">
            <select
              value={recipientId}
              onChange={(event) => setRecipientId(event.target.value)}
            >
              <option value="">A wish list I manage</option>
              <optgroup label="Private gift idea for">
                {recipients.map((person) => (
                  <option key={person.id} value={person.id}>
                    {person.name}
                  </option>
                ))}
              </optgroup>
            </select>
          </Field>
        )}
        <div className="actions">
          <button
            type="button"
            className="button secondary"
            onClick={async () => {
              try {
                const pasted = await navigator.clipboard.readText();
                if (pasted.length > 8192) {
                  setError(
                    "That message is too long. Copy just the product link and try again.",
                  );
                  return;
                }
                setText(pasted);
                setError("");
              } catch {
                setError(
                  "Clipboard access isn't available. Press and hold the field, or use your keyboard, to paste the link.",
                );
              }
            }}
          >
            Paste link
          </button>
          {lists.length > 0 || recipientId ? (
            <button className="button" type="submit" disabled={!text.trim()}>
              {recipientId ? "Review gift idea" : "Review item"}
            </button>
          ) : (
            <button
              className="button"
              type="button"
              onClick={() => open("Your first wish list", <ListForm />)}
            >
              Create a wish list
            </button>
          )}
          <button className="text-button" type="button" onClick={clear}>
            Clear
          </button>
        </div>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        {!lists.length && !recipientId && (
          <p>
            Create a wish list first. Your link will stay here while you do.
          </p>
        )}
        <p className="muted">
          Check the destination and details before saving. Gift ideas start
          private. If the shop cannot provide details, you can enter them
          yourself.
        </p>
      </form>
      <section className="capture-help" aria-label="Capture from shopping apps">
        <h2>From your shopping app</h2>
        <p>
          On supported browsers, install Little Hint, then choose it from the
          shopping app's Share menu.
        </p>
        <p>
          On iPhone, iPad, or if Little Hint isn't in the menu, copy the link,
          open Little Hint, and choose Capture a product from My lists.
        </p>
      </section>
    </>
  );
}
