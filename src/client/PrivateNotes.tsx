import { useState } from "react";
import { Pencil, Trash2 } from "lucide-react";
import type { GiftView } from "../shared/model";
import { useApp } from "./context";
import { Avatar } from "./components";
import { ActionMenu } from "./Management";
import { MentionNote, MentionText } from "./MentionNote";
import { Confirm } from "./Confirm";
export function PrivateNote({
  note,
  itemId,
  targeted,
}: {
  note: NonNullable<GiftView["comments"]>[number];
  itemId: string;
  targeted: boolean;
}) {
  const { open, mutate, toast } = useApp();
  const [editing, setEditing] = useState(false);
  const finish = () => {
    setEditing(false);
    requestAnimationFrame(() =>
      document.getElementById(`note-${note.id}`)?.focus(),
    );
  };
  return (
    <div
      className={`comment${targeted ? " targeted-note" : ""}`}
      id={`note-${note.id}`}
      tabIndex={-1}
    >
      <Avatar name={note.author} small />
      <div className="comment-content">
        <strong>{note.author}</strong>
        <small>
          {new Date(note.createdAt).toLocaleDateString()}
          {note.editedAt && " · Edited"}
        </small>
        {editing ? (
          <MentionNote itemId={itemId} note={note} onDone={finish} />
        ) : (
          <p>
            <MentionText body={note.body} mentions={note.mentions} />
          </p>
        )}
      </div>
      {!editing && (note.canEdit || note.canDelete) && (
        <ActionMenu name={`note by ${note.author}`}>
          {note.canEdit && (
            <button className="text-button" onClick={() => setEditing(true)}>
              <Pencil size={16} />
              Edit note
            </button>
          )}
          {note.canDelete && (
            <button
              className="text-button danger"
              onClick={() =>
                open(
                  "Delete this note?",
                  <Confirm
                    label="Delete note"
                    onConfirm={async () => {
                      await mutate("comments/delete", {
                        id: note.id,
                        revision: note.revision,
                      });
                      toast("Note deleted.");
                    }}
                  >
                    This permanently deletes the note. This cannot be undone.
                  </Confirm>,
                )
              }
            >
              <Trash2 size={16} />
              Delete note
            </button>
          )}
        </ActionMenu>
      )}
    </div>
  );
}
