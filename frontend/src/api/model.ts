import { request } from "../lib/client";
import type {
  ConfigResponse,
  HealthResponse,
  PredictRequest,
  PredictResponse,
  VersionResponse,
} from "../types/api";

export const getHealth = () => request<HealthResponse>("/health");

export const getVersion = () => request<VersionResponse>("/version");

export const getConfig = () => request<ConfigResponse>("/config");

export const predict = (body: PredictRequest) =>
  request<PredictResponse>("/predict", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
