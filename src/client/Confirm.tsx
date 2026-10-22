import type { ReactNode } from "react";
import { useApp } from "./context";
import { Form } from "./components";
export function Confirm({
  children,
  onConfirm,
  label,
}: {
  children: ReactNode;
  onConfirm: () => Promise<unknown>;
  label: string;
}) {
  const { close } = useApp();
  return (
    <Form
      submit={label}
      onSubmit={async () => {
        await onConfirm();
        close();
      }}
    >
      <p>{children}</p>
    </Form>
  );
}
