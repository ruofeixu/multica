import { queryOptions } from "@tanstack/react-query";
import { api } from "../api";

export const overseerKeys = {
  all: ["overseer"] as const,
  config: () => [...overseerKeys.all, "config"] as const,
};

export function overseerOptions() {
  return queryOptions({
    queryKey: overseerKeys.config(),
    queryFn: () => api.getOverseer(),
  });
}
