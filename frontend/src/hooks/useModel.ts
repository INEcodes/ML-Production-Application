import { useMutation, useQuery } from "@tanstack/react-query";
import { getConfig, getHealth, getVersion, predict } from "../api/model";

export const useHealth = () =>
  useQuery({
    queryKey: ["health"],
    queryFn: getHealth,
    refetchInterval: 60_000,
    retry: 1,
  });

export const useVersion = () =>
  useQuery({ queryKey: ["version"], queryFn: getVersion, staleTime: 5 * 60_000 });

export const useConfig = () =>
  useQuery({ queryKey: ["config"], queryFn: getConfig, staleTime: Infinity, retry: false });

export const usePredict = () => useMutation({ mutationFn: predict });
