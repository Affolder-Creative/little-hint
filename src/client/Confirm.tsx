import type { ReactNode } from "react";
import { useApp } from "./context";
import { Form } from "./components";
export function Confirm({
  children,
  onConfirm,
  label,
  allowOffline = false,
}: {
  children: ReactNode;
  onConfirm: () => Promise<unknown>;
  label: string;
  allowOffline?: boolean;
}) {
  const { close } = useApp();
  return (
    <Form
      submit={label}
      allowOffline={allowOffline}
      onSubmit={async () => {
        await onConfirm();
        close();
      }}
    >
      <p>{children}</p>
    </Form>
  );
}
