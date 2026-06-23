const jsonHeaders = { "Content-Type": "application/json" };
const apiBaseUrl = import.meta.env.VITE_API_URL || "";

const url = (path: string) => `${apiBaseUrl}${path}`;

const loggedFetch = async (path: string, init: RequestInit = {}) => {
  const requestUrl = url(path);
  const method = init.method || "GET";
  console.info("[client-api] request", { method, url: requestUrl || path });
  try {
    const response = await fetch(requestUrl, init);
    console.info("[client-api] response", {
      method,
      url: requestUrl || path,
      status: response.status,
      contentType: response.headers.get("content-type")
    });
    return response;
  } catch (error) {
    console.error("[client-api] network error", { method, url: requestUrl || path, error });
    throw error;
  }
};

async function parse<T>(response: Response): Promise<T> {
  if (response.status === 204) return null as T;
  const contentType = response.headers.get("content-type") || "";
  const text = await response.text();
  const data = contentType.includes("application/json") && text ? JSON.parse(text) : null;
  if (!contentType.includes("application/json")) {
    throw new Error(response.ok ? "Сервер вернул не JSON. Перезапустите backend и попробуйте снова." : "Запрос не обработан backend-сервером.");
  }
  if (!response.ok) throw new Error(data?.error || "Произошла ошибка");
  return data as T;
}

export const api = {
  get: <T>(path: string, token?: string) =>
    loggedFetch(path, { headers: token ? { Authorization: `Bearer ${token}` } : {}, credentials: "include" }).then(parse<T>),
  post: <T>(path: string, body: unknown, token?: string) =>
    loggedFetch(path, {
      method: "POST",
      headers: { ...jsonHeaders, ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify(body),
      credentials: "include"
    }).then(parse<T>),
  patch: <T>(path: string, body: unknown, token: string) =>
    loggedFetch(path, {
      method: "PATCH",
      headers: { ...jsonHeaders, Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
      credentials: "include"
    }).then(parse<T>),
  upload: <T>(path: string, body: FormData, token: string) =>
    loggedFetch(path, { method: "POST", headers: { Authorization: `Bearer ${token}` }, body, credentials: "include" }).then(parse<T>),
  download: async (path: string, token: string) => {
    const response = await loggedFetch(path, { headers: { Authorization: `Bearer ${token}` }, credentials: "include" });
    if (!response.ok) {
      const contentType = response.headers.get("content-type") || "";
      const data = contentType.includes("application/json") ? await response.json() : null;
      throw new Error(data?.error || "Не удалось скачать файл");
    }
    const disposition = response.headers.get("content-disposition") || "";
    const filename = decodeURIComponent(disposition.match(/filename\*=UTF-8''([^;]+)/)?.[1] || "export.xlsx");
    return { blob: await response.blob(), filename };
  },
  delete: <T>(path: string, body: unknown, token: string) =>
    loggedFetch(path, {
      method: "DELETE",
      headers: { ...jsonHeaders, Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
      credentials: "include"
    }).then(parse<T>),
  eventSource: (path: string) => {
    console.info("[client-api] event-source", { url: url(path) || path });
    return new EventSource(url(path), { withCredentials: true });
  }
};
