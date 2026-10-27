import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { ImportJob } from "../shared/model";
import { api } from "./api";

export function useImportJob(accountId: string) {
  const client = useQueryClient();
  const [id, setId] = useState("");
  const [creating, setCreating] = useState(false);
  const generation = useRef(0);
  useEffect(
    () => () => {
      generation.current++;
    },
    [accountId],
  );
  const query = useQuery({
    queryKey: ["import", accountId, id],
    queryFn: ({ signal }) =>
      api<ImportJob>(`imports/${id}`, undefined, { signal }),
    enabled: (q) =>
      !!id &&
      (!q.state.data || ["pending", "running"].includes(q.state.data.status)),
    staleTime: 0,
    retry: false,
    refetchIntervalInBackground: false,
    refetchInterval: (q) =>
      !q.state.error &&
      ["pending", "running"].includes(q.state.data?.status ?? "")
        ? 2000
        : false,
  });
  function reset() {
    generation.current++;
    void client.cancelQueries({ queryKey: ["import", accountId, id] });
    setId("");
    setCreating(false);
  }
  async function start(url: string, forceRefresh = false) {
    reset();
    const current = generation.current;
    setCreating(true);
    try {
      const job = await api<ImportJob>("imports", { url, forceRefresh });
      if (current !== generation.current) return;
      client.setQueryData(["import", accountId, job.id], job);
      setId(job.id);
    } catch (error) {
      if (current === generation.current) throw error;
    } finally {
      if (current === generation.current) setCreating(false);
    }
  }
  return {
    job: id ? query.data : undefined,
    error: id ? query.error : null,
    busy:
      creating ||
      (!!id &&
        !query.isError &&
        ["pending", "running"].includes(query.data?.status ?? "")),
    start,
    reset,
    retry: () => query.refetch(),
  };
}
