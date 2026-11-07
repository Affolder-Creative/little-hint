import { Field, Form, Logo } from "./components";
import { api, authClient, clearPersonalData } from "./api";
import { useQueryClient } from "@tanstack/react-query";
export function NameSetup({ dark }: { dark: boolean }) {
  const client = useQueryClient();
  return (
    <main className="name-setup">
      <Logo dark={dark} />
      <h1>What should we call you?</h1>
      <p>Add your name so your people can recognize you.</p>
      <Form
        submit="Save name and continue"
        onSubmit={async (data) => {
          await api("account/name", {
            firstName: data.get("firstName"),
            lastName: data.get("lastName"),
          });
          await client.invalidateQueries({ queryKey: ["world"] });
        }}
      >
        <Field label="First name">
          <input
            name="firstName"
            autoComplete="given-name"
            required
            maxLength={80}
          />
        </Field>
        <Field label="Last name">
          <input
            name="lastName"
            autoComplete="family-name"
            required
            maxLength={79}
          />
        </Field>
      </Form>
      <button
        className="text-button"
        onClick={async () => {
          await authClient.signOut();
          await clearPersonalData();
          location.reload();
        }}
      >
        Sign out
      </button>
    </main>
  );
}
