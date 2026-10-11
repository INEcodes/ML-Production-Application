// Mirrors serving/app/schemas.py. Update these first when the backend contract changes.

export type InputType = "image" | "text";

export interface HealthResponse {
  status: string;
  model_name: string;
  model_version: number;
}

export interface VersionResponse {
  model_name: string;
  model_version: number;
  input_type: InputType;
  labels: string[];
  git_commit: string | null;
  pushed_at: string | null;
  test_metrics: Record<string, number> | null;
  image_tag: string | null;
}

export type PredictRequest = { image_base64: string } | { text: string };

export interface PredictResponse {
  model_name: string;
  model_version: number;
  label: string;
  class_index: number;
  confidence: number;
  probabilities: Record<string, number>;
}

/** Answered by the Vercel function itself, not the model API. */
export interface ConfigResponse {
  backend: string | null;
}
