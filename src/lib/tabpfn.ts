// Minimal client for the Prior Labs TabPFN REST API (/tabpfn/* JSON routes).
// Uploads and fits are free; each predict call costs tokens (10k minimum).
// Docs: https://docs.priorlabs.ai/api-reference/getting-started

const BASE = "https://api.priorlabs.ai";
const MODEL = "v3.5_default";

type UploadInfo = { signed_urls: string[]; required_headers: Record<string, string> };

function headers() {
  const token = process.env.TABPFN_TOKEN;
  if (!token) throw new Error("TABPFN_TOKEN is not set");
  return { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const r = await fetch(BASE + path, { method: "POST", headers: headers(), body: JSON.stringify(body) });
  const text = await r.text();
  if (!r.ok) throw new Error(`TabPFN ${path} ${r.status}: ${text.slice(0, 300)}`);
  return JSON.parse(text) as T;
}

async function put(info: UploadInfo, csv: string) {
  const r = await fetch(info.signed_urls[0], { method: "PUT", headers: info.required_headers, body: csv });
  if (!r.ok) throw new Error(`TabPFN upload ${r.status}`);
}

function toCsv(columns: string[], rows: (number | null)[][]) {
  const cell = (v: number | null) => (v === null || Number.isNaN(v) ? "" : String(v));
  return [columns.join(","), ...rows.map((r) => r.map(cell).join(","))].join("\n");
}

/**
 * Fit TabPFN on (X, y) and return P(class 1) for each test row.
 * y must contain both classes.
 */
export async function predictProba(
  columns: string[],
  xTrain: (number | null)[][],
  yTrain: number[],
  xTest: (number | null)[][],
): Promise<number[]> {
  const prep = await post<{ train_set_upload_id: string; x_train_info: UploadInfo; y_train_info: UploadInfo }>(
    "/tabpfn/prepare_train_set_upload",
    { x_train_info: { format: "csv" }, y_train_info: { format: "csv" } },
  );
  await Promise.all([
    put(prep.x_train_info, toCsv(columns, xTrain)),
    put(prep.y_train_info, toCsv(["liked"], yTrain.map((v) => [v]))),
  ]);

  const fit = await post<{ fitted_train_set_id: string }>("/tabpfn/fit", {
    train_set_upload_id: prep.train_set_upload_id,
    task: "classification",
    tabpfn_config: { model_path: MODEL },
  });

  const test = await post<{ test_set_upload_id: string; x_test_info: UploadInfo }>(
    "/tabpfn/prepare_test_set_upload",
    { fitted_train_set_id: fit.fitted_train_set_id, x_test_info: { format: "csv" } },
  );
  await put(test.x_test_info, toCsv(columns, xTest));

  const res = await post<{ prediction: number[][] }>("/tabpfn/predict", {
    test_set_upload_id: test.test_set_upload_id,
    fitted_train_set_id: fit.fitted_train_set_id,
    task_config: { task: "classification", predict_params: { output_type: "probas" } },
  });

  // Classes are sorted, so column 1 is "liked = 1".
  return res.prediction.map((p) => p[1] ?? 0);
}
